/**
 * Helpline data freshness. Bump HELPLINES_LAST_VERIFIED in the SAME release as any change to a
 * helpline number or wording, so a stale cached copy is detectable by the student and by tests.
 * Written by the lead; the crisis page displays this date.
 */
export const HELPLINES_LAST_VERIFIED = "2026-11-20";

export const HELPLINES = [
  { id: "tele-manas", name: "Tele-MANAS", number: "14416", tel: "tel:14416" },
  { id: "kiran", name: "KIRAN", number: "1800-599-0019", tel: "tel:18005990019" },
  { id: "emergency", name: "Emergency", number: "112", tel: "tel:112" },
] as const;
