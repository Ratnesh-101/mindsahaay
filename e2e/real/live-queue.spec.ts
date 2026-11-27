import { test, expect, adminSql, lit, cleanupCreated, signIn, promoteToCounsellor, grantCareShare } from "./helpers";

// The counsellor crisis queue must update live. This was broken twice over and no unit test saw it:
// (1) the supabase_realtime publication was EMPTY, so nothing was ever streamed;
// (2) re-subscribing hit "cannot add postgres_changes callbacks after subscribe()".

test.afterAll(async () => {
  await cleanupCreated();
});

test("a new crisis event appears in the counsellor queue without a reload, with no realtime errors", async ({ browser, baseURL }) => {
  const student = await signIn(browser, "live-student", baseURL);
  const counsellor = await signIn(browser, "live-counsellor", baseURL);
  const cPage = counsellor.page;
  const errors: string[] = [];
  cPage.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  cPage.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text().slice(0, 160)}`);
  });

  try {
    promoteToCounsellor(counsellor.id);
    grantCareShare(student.id, counsellor.id);

    await cPage.goto("/counsellor", { waitUntil: "networkidle" });
    const main = cPage.locator("main");
    await expect(main).toContainText(/not monitored 24\/7/i, { timeout: 20_000 });
    await expect(main).not.toContainText(/live updates are unavailable/i);
    const actions = cPage.getByRole("button", { name: /acknowledge/i });
    await expect(actions).toHaveCount(0);

    // A crisis event arrives (inserted as the database owner, like the edge function or a trigger would).
    adminSql(
      `insert into public.risk_events (student_id, event_type, severity_level, trigger_source, action_taken) values (${lit(student.id)}, 'chat_crisis', 'crisis', 'chat_crisis', 'crisis_card_shown')`,
    );

    // It must show up on its own, quickly: no navigation, no reload.
    await expect(actions).toHaveCount(1, { timeout: 15_000 });
    await expect(main).not.toContainText(/live updates are unavailable/i);

    expect(errors, "realtime and page errors on the counsellor queue").toEqual([]);
  } finally {
    await student.context.close();
    await counsellor.context.close();
  }
});

test("the realtime publication contains the tables the crisis queue listens to", async () => {
  for (const table of ["risk_events", "risk_followups", "notifications"]) {
    expect(
      adminSql(`select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=${lit(table)}`),
      `${table} must be published or Realtime never delivers its changes`,
    ).toBe("1");
  }
});
