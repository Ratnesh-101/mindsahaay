import type { MoodEntry } from "../../shared/lib/api/moods";

/**
 * Creates dynamic demo mood entries spanning the past 30 days.
 * All timestamps are computed relative to the provided reference date (defaults to now).
 */
export function getDemoMoodEntries(now: Date = new Date()): MoodEntry[] {
  const baseTime = now.getTime();
  const DAY_MS = 86400000;

  return [
    // Current Week (Days 0 to 6) - 5 entries
    {
      id: "demo-m-0",
      mood: "Good",
      score: 8,
      tags: ["Hopeful", "Focused"],
      notes: "Completed group study sprint and restful evening walk.",
      created_at: new Date(baseTime).toISOString(),
    },
    {
      id: "demo-m-1",
      mood: "Okay",
      score: 6,
      tags: ["Calm"],
      notes: "Took a quiet walk around campus after lecture.",
      created_at: new Date(baseTime - 1 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-2",
      mood: "Rough",
      score: 4,
      tags: ["Overwhelmed", "Anxious"],
      notes: "Mid-semester assignment deadlines stacked up.",
      created_at: new Date(baseTime - 2 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-3",
      mood: "Good",
      score: 8,
      tags: ["Grateful", "Calm"],
      notes: "Video call with family from hostel.",
      created_at: new Date(baseTime - 3 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-5",
      mood: "Good",
      score: 8,
      tags: ["Focused"],
      notes: "Cleared doubt with professor during office hours.",
      created_at: new Date(baseTime - 5 * DAY_MS).toISOString(),
    },

    // Previous Week (Days 7 to 13) - 5 entries
    {
      id: "demo-m-7",
      mood: "Okay",
      score: 6,
      tags: ["Calm"],
      notes: "Quiet Sunday in the campus library.",
      created_at: new Date(baseTime - 7 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-8",
      mood: "Good",
      score: 7,
      tags: ["Focused", "Calm"],
      notes: "Finished lab exercise early.",
      created_at: new Date(baseTime - 8 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-10",
      mood: "Low",
      score: 5,
      tags: ["Exhausted", "Homesick"],
      notes: "Hostel mess was crowded, missing home food.",
      created_at: new Date(baseTime - 10 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-11",
      mood: "Good",
      score: 7,
      tags: ["Relieved"],
      notes: "Submitted lab report on time.",
      created_at: new Date(baseTime - 11 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-13",
      mood: "Okay",
      score: 6,
      tags: ["Calm"],
      notes: "Early morning jog before classes.",
      created_at: new Date(baseTime - 13 * DAY_MS).toISOString(),
    },

    // Older Days (Days 16 to 28) - 5 entries
    {
      id: "demo-m-16",
      mood: "Good",
      score: 8,
      tags: ["Focused", "Grateful"],
      notes: "Enjoyed evening chai with hostel friends.",
      created_at: new Date(baseTime - 16 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-19",
      mood: "Rough",
      score: 3,
      tags: ["Overwhelmed", "Stressed"],
      notes: "Heavy exam prep week.",
      created_at: new Date(baseTime - 19 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-22",
      mood: "Okay",
      score: 6,
      tags: ["Calm"],
      notes: "Restful weekend.",
      created_at: new Date(baseTime - 22 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-25",
      mood: "Good",
      score: 7,
      tags: ["Hopeful"],
      notes: "Campus cultural festival day.",
      created_at: new Date(baseTime - 25 * DAY_MS).toISOString(),
    },
    {
      id: "demo-m-28",
      mood: "Okay",
      score: 6,
      tags: ["Calm"],
      notes: "New semester started.",
      created_at: new Date(baseTime - 28 * DAY_MS).toISOString(),
    },
  ];
}
