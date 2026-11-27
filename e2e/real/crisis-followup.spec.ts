import {
  test,
  expect,
  adminSql,
  lit,
  cleanupCreated,
  signIn,
  getAccessToken,
  restAs,
  submitAssessment,
  promoteToCounsellor,
  grantCareShare,
} from "./helpers";

test.afterAll(async () => {
  await cleanupCreated();
});

test("crisis follow-through loop: PHQ-9 item 9, counsellor acknowledge, check-back, reopen", async ({ browser, baseURL }) => {
  const student = await signIn(browser, "student", baseURL);
  const counsellor = await signIn(browser, "counsellor", baseURL);
  const sPage = student.page;
  const cPage = counsellor.page;
  const step = (eventId: string) => adminSql(`select step from public.risk_followups where risk_event_id=${lit(eventId)} order by seq desc limit 1`);

  try {
    // 1. PHQ-9 with item 9 non-zero goes through the edge function and opens the follow-up.
    const sToken = await getAccessToken(sPage);
    const result = await submitAssessment(sToken, "phq9", [1, 1, 1, 1, 1, 1, 1, 1, 2]);
    expect(result.status).toBeLessThan(300);
    expect(result.json.assessment?.crisis).toBe(true);
    // One PHQ-9 creates exactly ONE risk event (the database trigger is the single source of truth;
    // the edge function used to insert a second one, which showed duplicate cards and doubled escalation).
    const sid = lit(student.id);
    await expect.poll(() => Number(adminSql(`select count(*) from public.risk_events where student_id=${sid}`))).toBe(1);
    await expect
      .poll(() => adminSql(`select count(*) from public.risk_events e where student_id=${sid} and not exists (select 1 from public.risk_followups f where f.risk_event_id=e.id and f.step::text='open')`))
      .toBe("0");

    // 2. Security: the student cannot resolve their own events through the API.
    const patch = await restAs(sToken, "PATCH", `risk_events?student_id=eq.${student.id}`, { resolved: true });
    expect(Array.isArray(patch.json) ? (patch.json as unknown[]).length : 0, "rows changed by the student's PATCH").toBe(0);
    expect(adminSql(`select count(*) from public.risk_events where student_id=${sid} and resolved`)).toBe("0");
    // 3. A verified counsellor with a care share sees the event and the honest coverage banner.
    promoteToCounsellor(counsellor.id);
    grantCareShare(student.id, counsellor.id);
    await cPage.goto("/counsellor", { waitUntil: "networkidle" });
    const main = cPage.locator("main");
    await expect(main).toContainText(/not monitored 24\/7/i, { timeout: 20_000 });
    await expect(main).toContainText(/crisis/i);

    // 4. Acknowledge moves the step and schedules the 24h and 72h check-backs.
    await cPage.getByRole("button", { name: /acknowledge/i }).first().click();
    let eventId = "";
    await expect
      .poll(() => (eventId = adminSql(`select risk_event_id from public.risk_followups f join public.risk_events e on e.id=f.risk_event_id where e.student_id=${sid} and f.step::text='acknowledged' limit 1`)), { timeout: 20_000 })
      .not.toBe("");
    expect(step(eventId)).toBe("acknowledged");
    await expect
      .poll(() => adminSql(`select coalesce(string_agg(kind, ',' order by kind),'none') from public.risk_checkback_prompts where risk_event_id=${lit(eventId)}`))
      .toBe("h24,h72");

    // 5. Time travel for the test only: make the 24h prompt due now.
    adminSql(`update public.risk_checkback_prompts set due_at = now() - interval '1 minute' where risk_event_id=${lit(eventId)} and kind='h24'`);

    // 6. The student sees the prompt with the helplines and answers "I want to talk".
    await sPage.goto("/dashboard", { waitUntil: "networkidle" });
    const talk = sPage.getByRole("button", { name: /want to talk/i }).first();
    await expect(talk).toBeVisible({ timeout: 20_000 });
    const mainText = await sPage.locator("main").innerText();
    expect(mainText).toContain("14416");
    expect(mainText).toContain("1800-599-0019");
    expect(mainText).toContain("112");
    const stepsBefore = Number(adminSql(`select count(*) from public.risk_followups where risk_event_id=${lit(eventId)}`));
    await talk.click();
    // "Reopened" is a new follow-up row whose step is open again (history is append-only).
    await expect
      .poll(() => Number(adminSql(`select count(*) from public.risk_followups where risk_event_id=${lit(eventId)}`)), { timeout: 20_000 })
      .toBe(stepsBefore + 1);
    expect(step(eventId)).toBe("open");
    await expect
      .poll(() => adminSql(`select count(*) from public.notifications where user_id=${lit(counsellor.id)} and type='checkback_want_to_talk'`))
      .toBe("1");

    // 7. Security: the student cannot rewrite the recorded check-back answer.
    const answerId = adminSql(`select id from public.risk_checkbacks where risk_event_id=${lit(eventId)} limit 1`);
    expect(answerId).not.toBe("");
    const before = adminSql(`select answer from public.risk_checkbacks where id=${lit(answerId)}`);
    expect(before).toMatch(/talk/i);
    const patch2 = await restAs(sToken, "PATCH", `risk_checkbacks?id=eq.${answerId}`, { answer: "okay" });
    expect(Array.isArray(patch2.json) ? (patch2.json as unknown[]).length : 0, "rows changed by the check-back PATCH").toBe(0);
    expect(adminSql(`select answer from public.risk_checkbacks where id=${lit(answerId)}`)).toBe(before);
  } finally {
    await student.context.close();
    await counsellor.context.close();
  }
});
