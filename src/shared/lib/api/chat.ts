import { useState, useCallback, useRef } from "react";
import { z } from "zod";
import { getFunctionUrl } from "../supabase";
import { getAuthenticatedSession } from "./sessionHelper";
import {
  ApiError,
  ValidationError,
  DegradedModeError,
} from "./errors";
import { detectRisk } from "../../../domain/risk/lexicon";

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  isCrisis: z.boolean().optional(),
  createdAt: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const ChatStreamRequestSchema = z.object({
  message: z.string().min(1, "Message cannot be empty").max(3000, "Message exceeds 3000 characters"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});
export type ChatStreamRequest = z.infer<typeof ChatStreamRequestSchema>;

export interface StreamChatOptions {
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  onPreparing?: () => void;
  onToken?: (token: string) => void;
  onComplete?: (fullReply: string, isCrisis: boolean) => void;
  onError?: (error: ApiError) => void;
  onDegraded?: (isDegraded: boolean) => void;
  signal?: AbortSignal;
}

export const CRISIS_RESPONSE_TEMPLATE =
  "I hear how heavy and painful things feel right now, but please know that you do not have to carry this alone. Your life matters. Please connect immediately with the free, confidential 24/7 helplines:\n\n" +
  "• Tele-MANAS: 14416 or 1800-891-4416 (24/7, 20+ Indian languages)\n" +
  "• KIRAN Helpline: 1800-599-0019 (DEPwD, 24/7)\n" +
  "• National Emergency Services: 112\n\n" +
  "A trained counsellor is ready to listen and support you right now.";

/**
 * Streams chat tokens from the Claude companion edge function (/chat/stream) using Server-Sent Events.
 * Deterministic safety pre-screening: checks lexicon for imminent crisis.
 * Degraded-mode transparency: when unreachable, explicitly sets degraded flag without silent localStorage fallbacks.
 * Output guard enforcement: model output is buffered and validated server-side per turn before delivery.
 */
export async function streamChat(options: StreamChatOptions): Promise<{
  reply: string;
  isCrisis: boolean;
  isDegraded: boolean;
}> {
  const { message, history = [], onPreparing, onToken, onComplete, onError, onDegraded, signal } = options;

  const validated = ChatStreamRequestSchema.safeParse({ message, history });
  if (!validated.success) {
    const valErr = new ValidationError("Invalid chat request", { issues: validated.error.issues });
    onError?.(valErr);
    throw valErr;
  }

  // 1. Client-side deterministic crisis pre-screen using pure domain logic
  const riskResult = detectRisk(message);
  const isCrisis = riskResult.level === "imminent" || riskResult.level === "high";

  if (isCrisis) {
    onDegraded?.(false);
    onToken?.(CRISIS_RESPONSE_TEMPLATE);
    onComplete?.(CRISIS_RESPONSE_TEMPLATE, true);
    return {
      reply: CRISIS_RESPONSE_TEMPLATE,
      isCrisis: true,
      isDegraded: false,
    };
  }

  const { session } = await getAuthenticatedSession();
  const endpoint = getFunctionUrl("/chat/stream");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ message: validated.data.message, history: validated.data.history }),
      signal,
    });
  } catch (netErr) {
    onDegraded?.(true);
    const degradedErr = new DegradedModeError(
      "MindMate companion API is unreachable. System operating in degraded mode.",
      { original: netErr instanceof Error ? netErr.message : String(netErr) },
    );
    onError?.(degradedErr);
    throw degradedErr;
  }

  if (!response.ok) {
    onDegraded?.(true);
    const status = response.status;
    const body = await response.text().catch(() => "");
    const errorMsg =
      status === 429
        ? "Rate limit exceeded (max 20 messages per minute). Please take a moment."
        : `Companion stream failed with status ${status}: ${body}`;
    const apiErr = new ApiError(errorMsg, status, status === 429 ? "RATE_LIMITED" : "STREAM_FAILED");
    onError?.(apiErr);
    throw apiErr;
  }

  const bodyStream = response.body;
  if (!bodyStream) {
    onDegraded?.(true);
    const err = new DegradedModeError("No readable stream received from companion API.");
    onError?.(err);
    throw err;
  }

  onDegraded?.(false);
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let accumulated = "";
  let currentEvent = "";
  let isServerCrisis = false;
  let isServerDegraded = false;
  let finalGuardedContent: string | null = null;

  try {
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) {
          currentEvent = "";
          continue;
        }

        if (trimmed.startsWith("event:")) {
          currentEvent = trimmed.replace(/^event:\s*/, "").trim();
          continue;
        }

        if (trimmed.startsWith("data:")) {
          const rawData = trimmed.replace(/^data:\s*/, "");
          if (rawData === "[DONE]") {
            break;
          }

          let parsed: unknown = null;
          try {
            parsed = JSON.parse(rawData);
          } catch {
            parsed = rawData;
          }

          const parsedObj = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;

          if (currentEvent === "preparing" || (parsedObj && parsedObj.status === "preparing")) {
            onPreparing?.();
            continue;
          }

          if (
            currentEvent === "done" ||
            (parsedObj &&
              "content" in parsedObj &&
              !("text" in parsedObj) &&
              !("token" in parsedObj))
          ) {
            if (parsedObj) {
              if (typeof parsedObj.content === "string") {
                finalGuardedContent = parsedObj.content;
              }
              if (parsedObj.isCrisis) {
                isServerCrisis = true;
              }
              if (parsedObj.degraded) {
                isServerDegraded = true;
                onDegraded?.(true);
              }
            }
            continue;
          }

          let token = "";
          if (typeof parsed === "string") {
            token = parsed;
          } else if (parsedObj && typeof parsedObj.token === "string") {
            token = parsedObj.token;
          } else if (parsedObj && typeof parsedObj.text === "string") {
            token = parsedObj.text;
          } else if (parsedObj && typeof parsedObj.content === "string") {
            token = parsedObj.content;
          }

          if (token) {
            accumulated += token;
            onToken?.(token);
          }
        }
      }
    }
  } catch (streamErr) {
    if (signal?.aborted) {
      return { reply: finalGuardedContent ?? accumulated, isCrisis: isServerCrisis, isDegraded: isServerDegraded };
    }
    const err = new ApiError("Companion stream interrupted", 500, "STREAM_INTERRUPTED", {
      original: streamErr,
    });
    onError?.(err);
    throw err;
  }

  const finalReply = finalGuardedContent ?? accumulated;
  onComplete?.(finalReply, isServerCrisis);
  return {
    reply: finalReply,
    isCrisis: isServerCrisis,
    isDegraded: isServerDegraded,
  };
}

export function useChatStream() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [isDegraded, setIsDegraded] = useState<boolean>(false);
  const [isCrisis, setIsCrisis] = useState<boolean>(false);
  const [error, setError] = useState<ApiError | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsStreaming(true);
      setIsPreparing(true);
      setError(null);

      const assistantId = crypto.randomUUID();
      let assistantContent = "";

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const history = messages.map((m) => ({ role: m.role, content: m.content }));

        await streamChat({
          message: trimmed,
          history,
          signal: controller.signal,
          onPreparing: () => {
            setIsPreparing(true);
          },
          onToken: (token) => {
            setIsPreparing(false);
            assistantContent += token;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last && last.id === assistantId) {
                return [...prev.slice(0, -1), { ...last, content: assistantContent }];
              }
              return [
                ...prev,
                {
                  id: assistantId,
                  role: "assistant",
                  content: assistantContent,
                  createdAt: new Date().toISOString(),
                },
              ];
            });
          },
          onComplete: (fullReply, detectedCrisis) => {
            setIsStreaming(false);
            setIsPreparing(false);
            if (detectedCrisis) {
              setIsCrisis(true);
            }
            if (fullReply) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.id === assistantId) {
                  return [...prev.slice(0, -1), { ...last, content: fullReply }];
                }
                return [
                  ...prev,
                  {
                    id: assistantId,
                    role: "assistant",
                    content: fullReply,
                    createdAt: new Date().toISOString(),
                  },
                ];
              });
            }
          },
          onError: (err) => {
            setError(err);
            setIsStreaming(false);
            setIsPreparing(false);
          },
          onDegraded: (degraded) => {
            setIsDegraded(degraded);
          },
        });
      } catch (err) {
        setIsStreaming(false);
        setIsPreparing(false);
        if (err instanceof ApiError) {
          setError(err);
        } else {
          setError(new ApiError(err instanceof Error ? err.message : "Chat failed"));
        }
      }
    },
    [messages],
  );

  const clearChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setMessages([]);
    setError(null);
    setIsDegraded(false);
    setIsCrisis(false);
    setIsPreparing(false);
  }, []);

  return {
    messages,
    isStreaming,
    isPreparing,
    isDegraded,
    isCrisis,
    error,
    sendMessage,
    clearChat,
  };
}
