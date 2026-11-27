/**
 * CONTRACT for the demo-data feature (written by the lead; the demo-data worker replaces the
 * implementation but must keep these exports and their meaning):
 *
 *  - DemoDataPanel (default export of ./DemoDataPanel): the "Load demo data" / "Clear demo data" UI.
 *      props: { variant?: "card" | "inline" }
 *  - useDemoDataStatus(): { hasDemo: boolean; loading: boolean }
 *      true while the signed-in user's account contains rows flagged is_demo = true.
 *      Other screens use it to show a small "includes demo data" notice.
 *
 * Demo data is ONLY ever created when the user presses the button. Nothing here runs on load.
 *
 * Additions: DemoBadge (small "Demo" label for a row) and DemoDataNotice ("Includes demo data").
 */
export { default as DemoDataPanel } from "./DemoDataPanel";
export { useDemoDataStatus } from "./useDemoDataStatus";
export { DemoBadge, DemoDataNotice } from "./DemoBadge";
