import { z } from "zod";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError } from "../../shared/lib/api/errors";
import { detectRisk } from "../../domain/risk/lexicon";
import { callFunction } from "../doctors/http";

export interface Circle {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  isPrivate: boolean;
}

export interface Post {
  id: string;
  title: string;
  content: string;
  isAnonymous: boolean;
  likesCount: number;
  createdAt: string;
}

function fail(error: { message: string; code?: string }): never {
  throw new ApiError(error.message, 500, error.code ?? "DB_ERROR");
}

export async function fetchCircles(): Promise<Circle[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("circles")
    .select("id, name, slug, description, category, is_private")
    .order("name", { ascending: true });
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    description: String(r.description ?? ""),
    category: String(r.category ?? "general"),
    isPrivate: Boolean(r.is_private),
  }));
}

export async function fetchMyCircleIds(): Promise<string[]> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase.from("circle_members").select("circle_id").eq("user_id", user.id);
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => String(r.circle_id));
}

export async function joinCircle(circleId: string): Promise<void> {
  const { user } = await getAuthenticatedSession();
  const { error } = await supabase.from("circle_members").insert({ circle_id: circleId, user_id: user.id });
  if (error) fail(error);
}

export async function leaveCircle(circleId: string): Promise<void> {
  const { user } = await getAuthenticatedSession();
  const { error } = await supabase.from("circle_members").delete().eq("circle_id", circleId).eq("user_id", user.id);
  if (error) fail(error);
}

/** Approved posts only. author_id is deliberately never selected, so anonymous authors cannot be exposed by the UI. */
export async function fetchPosts(circleId: string): Promise<Post[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("posts")
    .select("id, title, content, is_anonymous, likes_count, created_at")
    .eq("circle_id", circleId)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) fail(error);
  return (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    title: String(r.title),
    content: String(r.content),
    isAnonymous: Boolean(r.is_anonymous),
    likesCount: Number(r.likes_count ?? 0),
    createdAt: String(r.created_at),
  }));
}

/** A recent approved peer post, with the name and category of the circle it was shared in. */
export interface Voice extends Post {
  circleName: string;
  category: string;
}

/**
 * The latest approved posts across the circles this student can see (RLS decides which). This is the
 * real "Voices" feed: every item was written by a student and passed moderation. author_id is never selected.
 */
export async function fetchRecentVoices(limit = 30): Promise<Voice[]> {
  await getAuthenticatedSession();
  const { data, error } = await supabase
    .from("posts")
    .select("id, circle_id, title, content, is_anonymous, likes_count, created_at")
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) fail(error);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return [];
  const circles = await fetchCircles();
  const byId = new Map(circles.map((c) => [c.id, c]));
  return rows.map((r) => {
    const circle = byId.get(String(r.circle_id));
    return {
      id: String(r.id),
      title: String(r.title),
      content: String(r.content),
      isAnonymous: Boolean(r.is_anonymous),
      likesCount: Number(r.likes_count ?? 0),
      createdAt: String(r.created_at),
      circleName: circle?.name ?? "",
      category: circle?.category ?? "general",
    };
  });
}

const ClassifySchema = z
  .object({
    status: z.enum(["approved", "flagged", "rejected"]),
    riskLevel: z.enum(["crisis", "moderate", "medium", "low", "none"]).optional(),
    flagged: z.boolean().optional(),
    reasons: z.array(z.string()).optional(),
    containsPII: z.boolean().optional(),
    redactedContent: z.string().optional(),
    crisis: z.boolean().optional(),
  })
  .passthrough();
export type ModerationResult = z.infer<typeof ClassifySchema>;

/** POST /moderation/classify: AI pre-moderation (lexicon, PII redactor, crisis classifier). */
export async function classifyContent(input: { title: string; content: string; circleId: string }): Promise<ModerationResult> {
  const raw = await callFunction<unknown>("POST", "/moderation/classify", input);
  const parsed = ClassifySchema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError("Unexpected moderation response.", 502, "BAD_RESPONSE");
  }
  return parsed.data;
}

export type SubmitOutcome =
  | { kind: "crisis" }
  | { kind: "rejected"; reasons: string[] }
  | { kind: "queued"; reasons: string[] }
  | { kind: "posted"; redacted: boolean };

/**
 * Pre-moderates and publishes a post.
 * 1. A deterministic local lexicon pass catches self-harm content even when the API is down.
 * 2. POST /moderation/classify: crisis content is intercepted and never published.
 * 3. If classification fails the post is NOT published (fail closed); the error propagates.
 * 4. Approved or flagged posts go through POST /circles/:id/posts; the server queues anything flagged.
 */
export async function submitPost(input: {
  circleId: string;
  title: string;
  content: string;
  isAnonymous: boolean;
}): Promise<SubmitOutcome> {
  const local = detectRisk(`${input.title}. ${input.content}`);
  if (local.level === "high" || local.level === "imminent") {
    return { kind: "crisis" };
  }

  const verdict = await classifyContent({ title: input.title, content: input.content, circleId: input.circleId });
  if (verdict.crisis || verdict.riskLevel === "crisis") {
    return { kind: "crisis" };
  }
  const reasons = verdict.reasons ?? [];
  if (verdict.status === "rejected") {
    return { kind: "rejected", reasons };
  }

  const redacted = Boolean(verdict.containsPII && verdict.redactedContent);
  const content = redacted ? (verdict.redactedContent as string) : input.content;
  const created = await callFunction<Record<string, unknown> | null>("POST", `/circles/${encodeURIComponent(input.circleId)}/posts`, {
    title: input.title,
    content,
    isAnonymous: input.isAnonymous,
  });

  const serverStatus = String((created?.moderation_status ?? (created?.post as Record<string, unknown> | undefined)?.moderation_status ?? "") || "");
  if (verdict.status === "flagged" || (serverStatus !== "" && serverStatus !== "approved")) {
    return { kind: "queued", reasons };
  }
  return { kind: "posted", redacted };
}

export const REPORT_REASONS = ["self_harm", "harassment", "personal_info", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export async function reportPost(postId: string, reason: ReportReason, details: string): Promise<void> {
  const { user } = await getAuthenticatedSession();
  const { error } = await supabase.from("reports").insert({
    reporter_id: user.id,
    resource_type: "post",
    resource_id: postId,
    reason,
    details: details.trim() || null,
  });
  if (error) fail(error);
}

export async function fetchMyRole(): Promise<string> {
  const { user } = await getAuthenticatedSession();
  const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) fail(error);
  return String((data as { role?: string } | null)?.role ?? "student");
}

export interface QueueItem {
  key: string;
  kind: "report" | "flagged";
  reportId: string | null;
  postId: string;
  title: string;
  content: string;
  reason: string;
  createdAt: string;
}

/** Pending reports plus AI-flagged posts. Author ids are never selected, so moderators see anonymous posts. */
export async function fetchModerationQueue(): Promise<QueueItem[]> {
  await getAuthenticatedSession();
  const reports = await supabase
    .from("reports")
    .select("id, resource_type, resource_id, reason, details, created_at")
    .eq("moderation_status", "pending")
    .eq("resource_type", "post")
    .order("created_at", { ascending: true });
  if (reports.error) fail(reports.error);

  const flagged = await supabase
    .from("posts")
    .select("id, title, content, created_at, ai_moderation")
    .eq("moderation_status", "flagged")
    .order("created_at", { ascending: true });
  if (flagged.error) fail(flagged.error);

  const reportRows = (reports.data ?? []) as Record<string, unknown>[];
  const postIds = reportRows.map((r) => String(r.resource_id));
  let postsById = new Map<string, { title: string; content: string }>();
  if (postIds.length) {
    const posts = await supabase.from("posts").select("id, title, content").in("id", postIds);
    if (posts.error) fail(posts.error);
    postsById = new Map(
      ((posts.data ?? []) as Record<string, unknown>[]).map((p) => [String(p.id), { title: String(p.title), content: String(p.content) }]),
    );
  }

  const items: QueueItem[] = reportRows.map((r) => {
    const post = postsById.get(String(r.resource_id));
    return {
      key: `report-${r.id}`,
      kind: "report",
      reportId: String(r.id),
      postId: String(r.resource_id),
      title: post?.title ?? "",
      content: post?.content ?? "",
      reason: String(r.reason),
      createdAt: String(r.created_at),
    };
  });
  for (const p of (flagged.data ?? []) as Record<string, unknown>[]) {
    items.push({
      key: `flagged-${p.id}`,
      kind: "flagged",
      reportId: null,
      postId: String(p.id),
      title: String(p.title),
      content: String(p.content),
      reason: ((p.ai_moderation as { reasons?: string[] } | null)?.reasons ?? []).join(", "),
      createdAt: String(p.created_at),
    });
  }
  return items;
}

export type ModerationDecision = "approve" | "remove" | "dismiss";

/** Applies a moderator decision to a post and closes the matching report (if any). */
export async function decideQueueItem(item: QueueItem, decision: ModerationDecision): Promise<void> {
  const { user } = await getAuthenticatedSession();
  if (decision !== "dismiss") {
    const { error } = await supabase
      .from("posts")
      .update({ moderation_status: decision === "approve" ? "approved" : "rejected" })
      .eq("id", item.postId);
    if (error) fail(error);
  } else if (item.kind === "flagged") {
    throw new ApiError("Flagged posts must be approved or removed.", 422, "INVALID_DECISION");
  }
  if (item.reportId) {
    const { error } = await supabase
      .from("reports")
      .update({
        moderation_status: decision === "remove" ? "actioned" : "dismissed",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        action_taken: decision,
      })
      .eq("id", item.reportId);
    if (error) fail(error);
  }
}
