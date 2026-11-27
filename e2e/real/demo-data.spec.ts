import { test, expect, adminSql, lit, API, ANON_KEY, cleanupCreated, signIn, getAccessToken, restAs, promoteToCounsellor, grantCareShare, dbCount } from "./helpers";
import { INSTITUTION_ID } from "./env";

/**
 * "Load demo data" / "Clear demo data" against the real backend: rows are flagged is_demo, labelled,
 * never duplicated, never touch real rows, and are invisible to counsellors and to institution analytics.
 */

test.afterAll(async () => {
  await cleanupCreated();
});

const demoCount = (table: string, id: string) => Number(adminSql(`select count(*) from public.${table} where student_id=${lit(id)} and is_demo`));
const realCount = (table: string, id: string) => Number(adminSql(`select count(*) from public.${table} where student_id=${lit(id)} and not is_demo`));

async function rpc(token: string, name: string) {
  const res = await fetch(`${API}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  return { status: res.status, json: await res.json() };
}

function addRealMoods(studentId: string, n: number) {
  adminSql(
    `insert into public.mood_entries (student_id, mood, score, tags) select ${lit(studentId)}, 'Okay', 5, array['real'] from generate_series(1, ${n});`,
  );
}

test("Load demo data and Clear demo data work in the UI without touching real entries", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "demoui", baseURL);
  try {
    addRealMoods(id, 2);
    await page.goto("/settings", { waitUntil: "networkidle" });
    // Nothing is loaded just by visiting the page.
    expect(demoCount("mood_entries", id)).toBe(0);

    await page.getByRole("button", { name: "Load demo data" }).click();
    await expect(page.getByText(/Demo data loaded: 26 sample check-ins and 3 sample screenings/)).toBeVisible({ timeout: 15_000 });
    expect(demoCount("mood_entries", id)).toBe(26);
    expect(demoCount("assessments", id)).toBe(3);
    expect(realCount("mood_entries", id), "real rows untouched").toBe(2);
    expect(dbCount("risk_events", id), "demo screenings never raise an alert").toBe(0);

    // The panel now offers Clear (so a second Load cannot be pressed) and survives a reload.
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByText("Demo data is loaded")).toBeVisible();
    await expect(page.getByRole("button", { name: "Load demo data" })).toHaveCount(0);

    // Labels show wherever demo rows appear.
    await page.goto("/insights", { waitUntil: "networkidle" });
    await expect(page.getByText("Includes demo data").first()).toBeVisible();
    await page.goto("/mood", { waitUntil: "networkidle" });
    // The per-row "Demo" badges sit in the accessible data table, which is inside a closed <details>.
    await page.getByText("View accessible data table alternative").click();
    const badges = page.getByTestId("demo-badge");
    await expect(badges.first()).toBeVisible();
    await expect(badges.first()).toHaveText("Demo");
    // The chart only shows the selected time range, so compare against the rows actually listed:
    // every listed row carries a badge except the 2 real check-ins made just now.
    const listedRows = await page.locator("details table tbody tr").count();
    expect(listedRows, "demo rows are listed").toBeGreaterThan(2);
    expect(await badges.count(), "every listed row is badged except the 2 real ones").toBe(listedRows - 2);
    await expect(page.locator("details table tbody tr", { hasNot: page.getByTestId("demo-badge") })).toHaveCount(2);

    await page.goto("/settings", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Clear demo data" }).click();
    await page.getByRole("button", { name: "Yes, clear demo data" }).click();
    await expect(page.getByText(/Demo data cleared: 26 sample check-ins and 3 sample screenings removed/)).toBeVisible({ timeout: 15_000 });
    expect(demoCount("mood_entries", id)).toBe(0);
    expect(demoCount("assessments", id)).toBe(0);
    expect(realCount("mood_entries", id), "real rows survive Clear").toBe(2);
  } finally {
    await context.close();
  }
});

test("loading twice does not duplicate demo rows", async ({ browser, baseURL }) => {
  const { page, context, id } = await signIn(browser, "demotwice", baseURL);
  try {
    const token = await getAccessToken(page);
    expect((await rpc(token, "load_demo_data")).status).toBe(200);
    expect((await rpc(token, "load_demo_data")).status).toBe(200);
    expect(demoCount("mood_entries", id)).toBe(26);
    expect(demoCount("assessments", id)).toBe(3);
  } finally {
    await context.close();
  }
});

test("demo rows are invisible to a counsellor with a care share, real rows are visible", async ({ browser, baseURL }) => {
  const student = await signIn(browser, "demostud", baseURL);
  const counsellor = await signIn(browser, "democouns", baseURL);
  try {
    promoteToCounsellor(counsellor.id);
    grantCareShare(student.id, counsellor.id, ["moods", "assessments", "profile"]);
    addRealMoods(student.id, 2);
    expect((await rpc(await getAccessToken(student.page), "load_demo_data")).status).toBe(200);

    const cToken = await getAccessToken(counsellor.page);
    const moods = await restAs(cToken, "GET", `mood_entries?student_id=eq.${student.id}&select=id,is_demo`);
    const rows = moods.json as { is_demo: boolean }[];
    expect(moods.status).toBe(200);
    expect(rows.length, "control: the counsellor does see the real rows").toBe(2);
    expect(rows.every((r) => r.is_demo === false)).toBe(true);

    const assessments = await restAs(cToken, "GET", `assessments?student_id=eq.${student.id}&select=id`);
    expect(assessments.status).toBe(200);
    expect(assessments.json, "all 3 demo screenings hidden").toEqual([]);

    // The student still sees everything of their own.
    const own = await restAs(await getAccessToken(student.page), "GET", `mood_entries?select=id`);
    expect((own.json as unknown[]).length).toBe(28);
  } finally {
    await student.context.close();
    await counsellor.context.close();
  }
});

test("institution aggregates exclude demo rows (with a control that real rows are counted)", async ({ browser, baseURL }) => {
  const { context, id } = await signIn(browser, "demoagg", baseURL);
  try {
    adminSql(`update public.profiles set institution_id=${lit(INSTITUTION_ID)} where id=${lit(id)};`);
    // Mood and severity names unique to this run, so rows from other students or earlier runs in the
    // same institution and week cannot land in these groups.
    const tag = `${Date.now()}-${process.pid}`;
    const realMood = `E2E-Real-${tag}`;
    const demoMood = `E2E-Demo-${tag}`;
    const realBand = `E2E-Real-${tag}`;
    const demoBand = `E2E-Demo-${tag}`;

    // 12 real and 12 demo check-ins in the same week: k >= 10 is met by both groups.
    adminSql(`
      insert into public.mood_entries (student_id, mood, score, is_demo) select ${lit(id)}, ${lit(realMood)}, 6, false from generate_series(1,12);
      insert into public.mood_entries (student_id, mood, score, is_demo) select ${lit(id)}, ${lit(demoMood)}, 6, true from generate_series(1,12);
    `);
    // Expected value computed from the base table with the view's own grouping (institution, mood, week), real rows only.
    const expectedMood = (mood: string) =>
      adminSql(`
        select coalesce(sum(n),0) from (
          select count(*) n from public.mood_entries m join public.profiles p on p.id=m.student_id
          where p.institution_id=${lit(INSTITUTION_ID)} and m.mood=${lit(mood)} and m.is_demo=false
          group by date_trunc('week', m.created_at) having count(*) >= 10) g`);
    const viewMood = (mood: string) =>
      adminSql(`select coalesce(sum(sample_size),0) from public.institution_mood_aggregates where institution_id=${lit(INSTITUTION_ID)} and mood=${lit(mood)}`);
    const allMoodRows = (mood: string) => adminSql(`select count(*) from public.mood_entries where student_id=${lit(id)} and mood=${lit(mood)}`);

    expect(expectedMood(realMood), "control: the base table holds 12 real rows in a >= k group").toBe("12");
    expect(viewMood(realMood), "control: the view counts exactly the real rows").toBe(expectedMood(realMood));
    expect(allMoodRows(demoMood), "the 12 demo rows exist in the base table").toBe("12");
    expect(viewMood(demoMood), "demo rows are not aggregated").toBe("0");
    expect(adminSql(`select count(*) from public.institution_mood_aggregates where institution_id=${lit(INSTITUTION_ID)} and mood=${lit(demoMood)}`)).toBe("0");

    // Same for screenings: 10 real and 10 demo PHQ-9, each in its own severity band.
    adminSql(`
      insert into public.assessments (student_id, instrument, answers, total, severity, item9_flag, is_demo)
        select ${lit(id)}, 'phq9', array[1,1,1,1,0,1,0,1,0], 6, ${lit(realBand)}, false, false from generate_series(1,10);
      insert into public.assessments (student_id, instrument, answers, total, severity, item9_flag, is_demo)
        select ${lit(id)}, 'phq9', array[0,1,0,1,0,0,0,1,0], 3, ${lit(demoBand)}, false, true from generate_series(1,10);
    `);
    const expectedBand = (band: string) =>
      adminSql(`
        select coalesce(sum(n),0) from (
          select count(*) n from public.assessments a join public.profiles p on p.id=a.student_id
          where p.institution_id=${lit(INSTITUTION_ID)} and a.severity=${lit(band)} and a.is_demo=false
          group by a.instrument, date_trunc('month', a.completed_at) having count(*) >= 10) g`);
    const viewBand = (band: string) =>
      adminSql(`select coalesce(sum(sample_size),0) from public.institution_assessment_aggregates where institution_id=${lit(INSTITUTION_ID)} and severity=${lit(band)}`);

    expect(expectedBand(realBand), "control: the base table holds 10 real screenings in a >= k group").toBe("10");
    expect(viewBand(realBand), "control: the view counts exactly the real screenings").toBe(expectedBand(realBand));
    expect(adminSql(`select count(*) from public.assessments where student_id=${lit(id)} and severity=${lit(demoBand)} and is_demo`)).toBe("10");
    expect(viewBand(demoBand), "demo screenings are not aggregated").toBe("0");
  } finally {
    await context.close();
  }
});