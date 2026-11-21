// ==============================================================================
// Zod Validation Schemas for MindSahaay Backend Endpoints
// ==============================================================================

import { z } from "npm:zod";

// Assessment submission schema
export const assessmentSchema = z.object({
  instrument: z.enum(["phq4", "phq9", "gad7"]),
  answers: z.array(z.number().int().min(0).max(3)),
}).refine(
  (data) => {
    if (data.instrument === "phq4") return data.answers.length === 4;
    if (data.instrument === "phq9") return data.answers.length === 9;
    if (data.instrument === "gad7") return data.answers.length === 7;
    return false;
  },
  {
    message: "Answers array length does not match instrument specification (phq4: 4, phq9: 9, gad7: 7)",
  },
);

// Chat stream message schema
export const chatSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(3000, "Message exceeds 3000 character limit"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      }),
    )
    .max(30)
    .optional(),
});

// Mood entry schema
export const moodSchema = z.object({
  mood: z.string().min(1).max(50),
  score: z.number().int().min(1).max(10),
  tags: z.array(z.string().max(40)).max(10).optional(),
  notes: z.string().max(500).optional(),
});

// Appointment booking schema
export const appointmentSchema = z.object({
  counsellorId: z.string().uuid("Invalid counsellor UUID"),
  slotId: z.string().uuid("Invalid slot UUID").optional(),
  scheduledFor: z.string().optional(),
  slotTime: z.string().optional(),
  notes: z.string().max(500).optional(),
});

// Daily.co video token request schema
export const videoTokenSchema = z.object({
  isOwner: z.boolean().optional(),
}).optional();

// Content moderation classification schema
export const moderationClassifySchema = z.object({
  content: z.string().min(1, "Content cannot be empty").max(5000, "Content cannot exceed 5000 characters"),
  title: z.string().max(300).optional(),
  circleId: z.string().uuid("Invalid circle UUID").optional(),
});

// Community post creation schema
export const communityPostSchema = z.object({
  circleId: z.string().uuid("Invalid circle UUID"),
  title: z.string().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
  content: z.string().min(1, "Content is required").max(5000, "Content cannot exceed 5000 characters"),
  isAnonymous: z.boolean().optional().default(true),
});

// Community comment creation schema
export const commentSchema = z.object({
  postId: z.string().uuid("Invalid post UUID"),
  content: z.string().min(1, "Comment content is required").max(2000, "Comment cannot exceed 2000 characters"),
  isAnonymous: z.boolean().optional().default(true),
  parentCommentId: z.string().uuid().optional(),
});

// Zero-knowledge encrypted journal entry schema
export const journalSchema = z.object({
  ciphertext: z.string().min(1, "Ciphertext required"),
  iv: z.string().min(1, "IV required"),
  salt: z.string().min(1, "Salt required"),
});

// Zero-knowledge CBT thought record schema
export const thoughtRecordSchema = z.object({
  ciphertext: z.string().min(1, "Ciphertext required"),
  iv: z.string().min(1, "IV required"),
  salt: z.string().min(1, "Salt required"),
});

// Care share grant schema
export const careShareSchema = z.object({
  counsellorId: z.string().uuid("Invalid counsellor UUID"),
  scope: z.array(z.enum(["assessments", "moods", "safety_plan", "all"])).min(1),
  expiresAt: z.string().datetime().optional(),
});

// Safety plan schema
export const safetyPlanSchema = z.object({
  warningSigns: z.array(z.string()).optional(),
  copingStrategies: z.array(z.string()).optional(),
  emergencyContacts: z
    .array(
      z.object({
        name: z.string(),
        relationship: z.string(),
        phone: z.string(),
      }),
    )
    .optional(),
  safeEnvironments: z.array(z.string()).optional(),
  reasonsToLive: z.array(z.string()).optional(),
});
