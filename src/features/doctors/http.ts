import { getFunctionUrl } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError, NetworkError } from "../../shared/lib/api/errors";

/**
 * Calls a MindSahaay edge-function route with the signed-in student's JWT.
 * Network failures become NetworkError; non-2xx responses become ApiError carrying the HTTP status.
 */
export async function callFunction<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const { session } = await getAuthenticatedSession();
  let response: Response;
  try {
    response = await fetch(getFunctionUrl(path), {
      method,
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw new NetworkError("The MindSahaay service could not be reached.", {
      original: err instanceof Error ? err.message : String(err),
    });
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload && typeof (payload as { error: unknown }).error === "string"
        ? (payload as { error: string }).error
        : `Request failed with status ${response.status}`;
    const code = response.status === 409 ? "CONFLICT" : response.status === 403 ? "FORBIDDEN" : "REQUEST_FAILED";
    throw new ApiError(message, response.status, code);
  }
  return payload as T;
}
