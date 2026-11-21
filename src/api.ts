/**
 * @deprecated TODO: Deprecated compat shim. Use typed API modules in `@/shared/lib/api/*`
 * and AuthProvider in `@/app/providers/AuthProvider` instead.
 * Maintained temporarily for legacy feature compatibility.
 */

import {
  FUNCTIONS_BASE_URL,
  SUPABASE_ANON_KEY,
} from "./shared/lib/supabase";
import {
  scorePHQ4,
  validatePHQ4Answers,
  PHQ4_DISCLAIMER,
} from "./domain/scoring/phq4";
import {
  scorePHQ9,
  validatePHQ9Answers,
  type PHQ9Answers,
} from "./domain/scoring/phq9";
import { detectRisk } from "./domain/risk/lexicon";
import { MANDATORY_HELPLINES } from "./domain/risk/riskRouting";
import { submitAssessment } from "./shared/lib/api/assessments";
import { addMood, fetchMoods } from "./shared/lib/api/moods";
import { exportStudentData, deleteStudentAccount } from "./shared/lib/api/account";
import { fetchJournals, saveJournal as saveJournalEncrypted, deleteJournal as deleteJournalEncrypted } from "./shared/lib/api/journal";

// Re-export modern data layer & providers for streamlined migration
export * from "./shared/lib/api";
export * from "./app/providers";

const baseUrl = FUNCTIONS_BASE_URL;

async function legacyRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "Request failed" }));
      throw new Error(body.error ?? `Request failed with status ${response.status}`);
    }
    return response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  isCrisis?: boolean;
  createdAt: string;
};

export type Appointment = {
  id: string;
  doctorId: string;
  doctorName: string;
  scheduledFor: string;
  slotTime: string;
  status: string;
  meetingUrl?: string;
  bookedAt: string;
};

export type JournalEntry = {
  id: string;
  title: string;
  content: string;
  mood: string;
  prompt: string;
  createdAt: string;
};

export type CommunityStory = {
  id: string;
  title: string;
  campus: string;
  theme: "Exams & Burnout" | "Social Anxiety" | "Homesickness" | "Recovery";
  author: string;
  excerpt: string;
  fullText: string;
  likes: number;
  readTime: string;
};

const defaultStories: CommunityStory[] = [
  {
    id: "story-1",
    title: "How I survived my third semester semester-exams meltdown",
    campus: "Delhi University · North Campus",
    theme: "Exams & Burnout",
    author: "B.Sc. Mathematics Student",
    readTime: "3 min read",
    likes: 84,
    excerpt: "I felt like an imposter among toppers until I learned to stop linking my entire self-worth to GPA scores.",
    fullText:
      "In my 3rd semester, I had continuous panic attacks during internals. My sleep cycle collapsed to 3 hours. Talking to a campus counsellor via MindSahaay helped me realize that setting realistic boundaries is not laziness—it's survival. I started 10-minute daily walks across campus and prioritized 7 hours of sleep. My scores actually improved once I stopped starving my brain of rest.",
  },
  {
    id: "story-2",
    title: "Moving 1,800 km away from home to an engineering hostel",
    campus: "IIT Bombay · Powai",
    theme: "Homesickness",
    author: "First-Year B.Tech Student",
    readTime: "4 min read",
    likes: 112,
    excerpt: "Homesickness was choking me in the mess hall. Here is what actually helped me find my footing.",
    fullText:
      "Coming from Assam to Mumbai was a massive cultural shock. I missed home-cooked food, felt isolated, and spent weekends crying in my hostel room. What changed was joining the campus astronomy club and using the 5-4-3-2-1 grounding technique whenever panic struck. You don't have to make 20 friends on day one. Finding just one person who listens makes a world of difference.",
  },
  {
    id: "story-3",
    title: "Overcoming presentation anxiety and social dread in seminars",
    campus: "BITS Pilani",
    theme: "Social Anxiety",
    author: "Final Year Economics Student",
    readTime: "3 min read",
    likes: 67,
    excerpt: "My hands shook and my voice cracked every time my name was called. Here is my recovery blueprint.",
    fullText:
      "Social anxiety in university is exhausting because every seminar feels like a trial. Working with a counsellor taught me 'cognitive reframing': most people in the audience aren't judging you, they're anxious about their own turns! Doing 4-7-8 breathing right before standing up lowers heart rate by 15 beats per minute. Be gentle with yourself.",
  },
];

let inMemoryStories: CommunityStory[] = [...defaultStories];
const inMemoryChatHistory: Record<string, ChatMessage[]> = {};
const inMemoryAppointments: Record<string, Appointment[]> = {};
const inMemoryJournals: Record<string, JournalEntry[]> = {};

export const wellnessApi = {
  initializeStudent: async (
    studentId: string,
    profileOverride?: { name?: string; email?: string; institution?: string },
  ) => {
    try {
      return await legacyRequest(`/students/${studentId}/initialize`, {
        method: "POST",
        body: JSON.stringify(profileOverride || {}),
      });
    } catch {
      return {
        status: "initialized",
        profile: {
          id: studentId,
          name: profileOverride?.name || "Student",
          institution: profileOverride?.institution || "University",
          email: profileOverride?.email || "student@institution.ac.in",
          initializedAt: new Date().toISOString(),
        },
      };
    }
  },

  getDashboard: async (studentId: string) => {
    try {
      return await legacyRequest(`/students/${studentId}/dashboard`);
    } catch {
      let moods: Array<{ id: string; mood: string; score: number; recordedAt: string }> = [];
      try {
        const liveMoods = await fetchMoods({ limit: 7 });
        moods = liveMoods.map((m) => ({
          id: m.id,
          mood: m.mood,
          score: m.score,
          recordedAt: m.created_at,
        }));
      } catch {
        moods = [];
      }

      return {
        profile: {
          id: studentId,
          name: "Aarav Singh",
          institution: "Delhi University",
        },
        recentMoods: moods,
        latestAssessment: null,
        appointments: inMemoryAppointments[studentId] || [],
      };
    }
  },

  saveMood: async (studentId: string, mood: string, score: number) => {
    try {
      const added = await addMood({ mood, score });
      return {
        success: true,
        mood: {
          id: added.id,
          mood: added.mood,
          score: added.score,
          recordedAt: added.created_at,
        },
      };
    } catch {
      // Legacy fallback
      try {
        return await legacyRequest(`/students/${studentId}/moods`, {
          method: "POST",
          body: JSON.stringify({ mood, score }),
        });
      } catch {
        const entry = { id: crypto.randomUUID(), mood, score, recordedAt: new Date().toISOString() };
        return { success: true, mood: entry };
      }
    }
  },

  /**
   * Fixed bug: Delegates scoring and band categorization to src/domain (pure logic).
   * Replaces faulty prototype bands (score > 8 ? 'high' : ...) with standardized clinical cutoffs.
   */
  saveAssessment: async (studentId: string, score: number, answers: number[]) => {
    let band: string = "normal";
    let anxietyScore = 0;
    let depressionScore = 0;
    let item9Flag = false;
    let isCrisis = false;
    let disclaimer = PHQ4_DISCLAIMER;

    if (answers && answers.length === 4 && validatePHQ4Answers(answers)) {
      const phq4Result = scorePHQ4(answers);
      band = phq4Result.band;
      anxietyScore = phq4Result.anxietyScore;
      depressionScore = phq4Result.depressionScore;
      disclaimer = phq4Result.disclaimer;
    } else if (answers && answers.length === 9 && validatePHQ9Answers(answers)) {
      const phq9Result = scorePHQ9(answers as PHQ9Answers);
      band = phq9Result.band;
      item9Flag = phq9Result.item9Flag;
      isCrisis = phq9Result.requiresCrisisProtocol;
      disclaimer = phq9Result.disclaimer;
    }

    try {
      const instrument = answers?.length === 9 ? "phq9" : answers?.length === 7 ? "gad7" : "phq4";
      const result = await submitAssessment({ instrument, answers });
      return {
        success: true,
        assessment: {
          id: result.assessment.id,
          score: result.assessment.total,
          answers: result.assessment.answers,
          anxietyScore,
          depressionScore,
          completedAt: result.assessment.completed_at || new Date().toISOString(),
          category: result.assessment.severity,
          item9Flag: result.assessment.item9_flag,
          isCrisis: result.assessment.crisis,
          disclaimer: result.assessment.disclaimer,
        },
      };
    } catch {
      const assessment = {
        id: crypto.randomUUID(),
        score,
        answers,
        anxietyScore,
        depressionScore,
        completedAt: new Date().toISOString(),
        category: band,
        item9Flag,
        isCrisis,
        disclaimer,
      };
      return { success: true, assessment };
    }
  },

  bookAppointment: async (
    studentId: string,
    appointment: { doctorId: string; doctorName: string; scheduledFor: string; slotTime?: string },
  ): Promise<{ success: boolean; appointment: Appointment }> => {
    try {
      return await legacyRequest<{ success: boolean; appointment: Appointment }>(
        `/students/${studentId}/appointments`,
        {
          method: "POST",
          body: JSON.stringify(appointment),
        },
      );
    } catch {
      const entry: Appointment = {
        id: `MS-${Date.now().toString().slice(-6)}`,
        doctorId: appointment.doctorId,
        doctorName: appointment.doctorName,
        scheduledFor: appointment.scheduledFor,
        slotTime: appointment.slotTime || "4:30 PM",
        status: "confirmed",
        meetingUrl: "https://meet.mindsahaay.org/consultation/" + crypto.randomUUID().slice(0, 8),
        bookedAt: new Date().toISOString(),
      };
      if (!inMemoryAppointments[studentId]) {
        inMemoryAppointments[studentId] = [];
      }
      inMemoryAppointments[studentId].unshift(entry);
      return { success: true, appointment: entry };
    }
  },

  getChat: async (studentId: string) => {
    try {
      return await legacyRequest<{ messages: ChatMessage[] }>(`/students/${studentId}/chat`);
    } catch {
      return { messages: inMemoryChatHistory[studentId] || [] };
    }
  },

  /**
   * Fixed bug: Delegates crisis detection to src/domain/risk/lexicon (pure logic).
   * Replaces divergent hardcoded crisisWords array with multilingual normalized risk detection.
   */
  sendChat: async (studentId: string, message: string) => {
    const risk = detectRisk(message);
    const isCrisis = risk.level === "imminent" || risk.level === "high";

    if (isCrisis) {
      const helplineLines = MANDATORY_HELPLINES.map(
        (h) => `• ${h.name}: ${h.number}${h.tollFree ? ` / ${h.tollFree}` : ""}`,
      ).join("\n");

      const crisisReply =
        `I hear how heavy and painful things feel right now, but please know you do not have to carry this alone. Your life matters. Please connect immediately with free, confidential 24/7 helplines:\n\n` +
        `${helplineLines}\n\n` +
        `A caring, trained counsellor is available right now.`;

      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: crisisReply,
        isCrisis: true,
        createdAt: new Date().toISOString(),
      };

      if (!inMemoryChatHistory[studentId]) inMemoryChatHistory[studentId] = [];
      inMemoryChatHistory[studentId].push(userMsg, botMsg);
      return { messages: [userMsg, botMsg], isCrisis: true };
    }

    try {
      return await legacyRequest<{ messages: ChatMessage[]; isCrisis?: boolean }>(
        `/students/${studentId}/chat`,
        {
          method: "POST",
          body: JSON.stringify({ message }),
        },
      );
    } catch {
      const userMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      const botMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content:
          "Thank you for sharing that with me. It takes courage to check in with yourself. How can I best support you today?",
        isCrisis: false,
        createdAt: new Date().toISOString(),
      };

      if (!inMemoryChatHistory[studentId]) inMemoryChatHistory[studentId] = [];
      inMemoryChatHistory[studentId].push(userMsg, botMsg);
      return { messages: [userMsg, botMsg], isCrisis: false };
    }
  },

  clearChat: async (studentId: string) => {
    delete inMemoryChatHistory[studentId];
  },

  getJournals: async (studentId: string): Promise<JournalEntry[]> => {
    try {
      const live = await fetchJournals();
      return live.map((j) => ({
        id: j.id,
        title: j.title,
        content: j.content,
        mood: j.mood,
        prompt: j.prompt,
        createdAt: j.createdAt,
      }));
    } catch {
      return (
        inMemoryJournals[studentId] || [
          {
            id: "j-1",
            title: "Releasing today's pressure",
            prompt: "What is one thought you can let go of tonight?",
            content:
              "I kept stressing about my lab presentation on Friday. But I've prepared my slides and practiced twice. Worrying tonight won't change the outcome—sleep will actually help my delivery.",
            mood: "Calmer",
            createdAt: new Date(Date.now() - 86400000).toISOString(),
          },
        ]
      );
    }
  },

  saveJournal: async (
    studentId: string,
    entry: Omit<JournalEntry, "id" | "createdAt">,
  ): Promise<JournalEntry> => {
    try {
      // If user has passphrase, use encryption module; otherwise store in compat memory
      const saved = await saveJournalEncrypted({
        title: entry.title,
        content: entry.content,
        mood: entry.mood,
        prompt: entry.prompt,
        passphrase: `session-key-${studentId}`,
      });
      return {
        id: saved.id,
        title: saved.title,
        content: saved.content,
        mood: saved.mood,
        prompt: saved.prompt,
        createdAt: saved.createdAt,
      };
    } catch {
      const newEntry: JournalEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
      };
      if (!inMemoryJournals[studentId]) inMemoryJournals[studentId] = [];
      inMemoryJournals[studentId].unshift(newEntry);
      return newEntry;
    }
  },

  deleteJournal: async (studentId: string, id: string) => {
    try {
      await deleteJournalEncrypted(id);
    } catch {
      if (inMemoryJournals[studentId]) {
        inMemoryJournals[studentId] = inMemoryJournals[studentId].filter((j) => j.id !== id);
      }
    }
  },

  getStories: async (): Promise<CommunityStory[]> => {
    return inMemoryStories;
  },

  likeStory: async (id: string) => {
    inMemoryStories = inMemoryStories.map((s) => (s.id === id ? { ...s, likes: s.likes + 1 } : s));
    return inMemoryStories;
  },

  exportStudentData: async (_studentId: string) => {
    try {
      return await exportStudentData();
    } catch {
      return {
        exportMetadata: {
          platform: "MindSahaay Student Wellbeing",
          exportedAt: new Date().toISOString(),
          regulations: "India DPDP Act 2023 & Mental Healthcare Act 2017",
        },
        profile: { id: _studentId },
        moods: [],
        assessment: null,
        appointments: inMemoryAppointments[_studentId] || [],
        chat: inMemoryChatHistory[_studentId] || [],
        journals: inMemoryJournals[_studentId] || [],
      };
    }
  },

  deleteStudentData: async (_studentId: string) => {
    try {
      await deleteStudentAccount();
    } catch {
      delete inMemoryChatHistory[_studentId];
      delete inMemoryAppointments[_studentId];
      delete inMemoryJournals[_studentId];
    }
  },
};
