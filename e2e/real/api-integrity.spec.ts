import { test, expect, adminSql, lit, cleanupCreated, signIn, getAccessToken, restAs, submitAssessment, API, ANON_KEY, FUNCTIONS_SLUG } from "./helpers";

// Real-backend API integrity checks. They guard defects that were found by RUNNING the system and
// that mocked unit tests could not see: duplicate crisis events, anonymous access, cross-student
// reads and an alias leak through a SECURITY DEFINER helper.

test.afterAll(async () => {
  await cleanupCreated();
});

const fn = (path: string) => `${API}/functions/v1/${FUNCTIONS_SLUG}${path}`;

test("edge function is healthy and refuses a caller who only has the anon key", async () => {
  const health = await fetch(fn("/health"), { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
  expect(health.status).toBe(200);

  const anonOnly = await fetch(fn("/assessments"), {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ instrument: "phq9", answers: [0, 0, 0, 0, 0, 0, 0, 0, 0] }),
  });
  expect(anonOnly.status, "no signed-in user must mean 401").toBe(401);
});

test("one PHQ-9 with item 9 creates exactly one risk event, one follow-up step and one audit row", async ({ browser, baseURL }) => {
  const student = await signIn(browser, "integrity", baseURL);
  try {
    const token = await getAccessToken(student.page);
    const res = await submitAssessment(token, "phq9", [1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(res.status).toBeLessThan(300);
    expect(res.json.assessment?.crisis).toBe(true);
    expect(res.json.assessment?.crisisProtocol, "helplines must come back in the response").toBeTruthy();

    const sid = lit(student.id);
    // The database trigger is the single source of truth. The edge function used to insert a second,
    // differently shaped event and a second audit row as well (duplicate cards, double escalation).
    await expect.poll(() => adminSql(`select count(*) from public.risk_events where student_id=${sid}`)).toBe("1");
    await expect
      .poll(() => adminSql(`select count(*) from public.risk_followups f join public.risk_events e on e.id=f.risk_event_id where e.student_id=${sid}`))
      .toBe("1");
    await expect
      .poll(() => adminSql(`select count(*) from public.audit_log where actor_id=${sid} and action='CRISIS_PROTOCOL_ACTIVATED'`))
      .toBe("1");
    // And it stays at one after a moment (no late second insert).
    await new Promise((r) => setTimeout(r, 1500));
    expect(adminSql(`select count(*) from public.risk_events where student_id=${sid}`)).toBe("1");
  } finally {
    await student.context.close();
  }
});

test("cross-student isolation: one student cannot read another's data or alias", async ({ browser, baseURL }) => {
  const a = await signIn(browser, "iso-a", baseURL);
  const b = await signIn(browser, "iso-b", baseURL);
  try {
    const tokenA = await getAccessToken(a.page);
    const tokenB = await getAccessToken(b.page);
    // A has real data: an assessment (and with it a crisis event).
    const sub = await submitAssessment(tokenA, "phq9", [1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(sub.status).toBeLessThan(300);
    await expect.poll(() => adminSql(`select count(*) from public.assessments where student_id=${lit(a.id)}`)).toBe("1");

    // B asks for A's rows by id: row level security must return nothing.
    for (const table of ["assessments", "risk_events", "mood_entries", "journal_entries", "safety_plans", "consents"]) {
      const r = await restAs(tokenB, "GET", `${table}?student_id=eq.${a.id}&select=*`);
      expect(r.status, `${table} read by another student`).toBeLessThan(500);
      expect(Array.isArray(r.json) ? (r.json as unknown[]).length : 0, `${table} rows of student A visible to B`).toBe(0);
    }

    // The alias helper used to be a SECURITY DEFINER function any signed-in user could call.
    const alias = await fetch(`${API}/rest/v1/rpc/get_student_alias_for_care`, {
      method: "POST",
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_student_id: a.id }),
    });
    const aliasBody = await alias.text();
    expect(aliasBody === "null" || alias.status >= 400, `alias of another student must not be returned (got ${alias.status} ${aliasBody.slice(0, 40)})`).toBe(true);

    // The legacy per-student export route must ignore the id in the URL and use the token's identity.
    const exp = await fetch(fn(`/students/${a.id}/export`), { headers: { apikey: ANON_KEY, Authorization: `Bearer ${tokenB}` } });
    expect(exp.status).toBeLessThan(300);
    const exported = (await exp.json()) as { profile?: { id?: string } };
    expect(exported.profile?.id, "export must belong to the caller (B), never to the id in the URL (A)").toBe(b.id);
    expect(JSON.stringify(exported)).not.toContain(a.id);
  } finally {
    await a.context.close();
    await b.context.close();
  }
});
