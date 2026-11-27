import { z } from "zod";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "../../shared/lib/supabase";
import { getAuthenticatedSession } from "../../shared/lib/api/sessionHelper";
import { ApiError, ValidationError } from "../../shared/lib/api/errors";
import { isDemoModeActive } from "../auth/demoMode";

/** Result of load_demo_data() / clear_demo_data(), and of the presence query. */
export const DemoCountsSchema = z.object({
  moods: z.number().int().nonnegative(),
  assessments: z.number().int().nonnegative(),
});
export type DemoCounts = z.infer<typeof DemoCountsSchema>;

export const DEMO_STATUS_KEY = ["demo-data", "status"] as const;

/** Raised when the demo-data database functions are not installed on the server. */
export class DemoDataUnavailableError extends ApiError {
  constructor(message = "Demo data is not available on this server.", details?: Record<string, unknown>) {
    super(message, 404, "DEMO_DATA_UNAVAILABLE", details);
    this.name = "DemoDataUnavailableError";
  }
}

interface RpcError {
  message: string;
  code?: string;
  status?: number;
}

function toApiError(error: RpcError): ApiError {
  // PGRST202: function not found in the schema cache. 42883: undefined_function.
  if (error.code === "PGRST202" || error.code === "42883" || error.status === 404) {
    return new DemoDataUnavailableError(error.message, { original: error });
  }
  return new ApiError(error.message, error.status ?? 500, error.code ?? "DEMO_DATA_FAILED", {
    original: error,
  });
}

async function callRpc(name: "load_demo_data" | "clear_demo_data"): Promise<DemoCounts> {
  await getAuthenticatedSession();
  const { data, error } = await supabase.rpc(name);
  if (error) {
    throw toApiError(error);
  }
  const parsed = DemoCountsSchema.safeParse(data);
  if (!parsed.success) {
    // The server did not confirm success in the expected shape: never claim success.
    throw new ValidationError(`Unexpected response from ${name}`, { issues: parsed.error.issues });
  }
  return parsed.data;
}

/** Inserts the labelled sample rows into the signed-in user's own account (idempotent on the server). */
export function loadDemoData(): Promise<DemoCounts> {
  return callRpc("load_demo_data");
}

/** Removes only the signed-in user's is_demo rows. Real rows are never touched. */
export function clearDemoData(): Promise<DemoCounts> {
  return callRpc("clear_demo_data");
}

async function countDemoRows(table: "mood_entries" | "assessments"): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("is_demo", true);
  if (error) {
    throw toApiError(error);
  }
  return count ?? 0;
}

/** How many demo rows the signed-in user currently has (RLS limits this to their own rows). */
export async function fetchDemoStatus(): Promise<DemoCounts> {
  await getAuthenticatedSession();
  const [moods, assessments] = await Promise.all([
    countDemoRows("mood_entries"),
    countDemoRows("assessments"),
  ]);
  return { moods, assessments };
}

/** Query-key prefixes that must NOT be refetched after a demo load or clear. */
const UNRELATED_KEYS = new Set(["journals", "safety_plan", "consents"]);

/**
 * Refreshes everything that can show moods, assessments, insights or dashboard figures. This is a
 * deny-list on purpose: any current or future query that reads those tables is refreshed.
 */
export function invalidateDemoDependents(queryClient: QueryClient): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: (query) => {
      const head = query.queryKey[0];
      return typeof head !== "string" || !UNRELATED_KEYS.has(head);
    },
  });
}

/** Counts of demo rows. Disabled in the offline preview, which never calls the backend. */
export function useDemoDataCounts() {
  const previewActive = isDemoModeActive();
  return useQuery({
    queryKey: DEMO_STATUS_KEY,
    queryFn: fetchDemoStatus,
    enabled: !previewActive,
    retry: false,
    staleTime: 30_000,
  });
}

export function useLoadDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: loadDemoData,
    onSuccess: (counts) => {
      // The RPC confirmed success, so the presence state is known; the invalidation below
      // then replaces it with the server truth.
      queryClient.setQueryData(DEMO_STATUS_KEY, counts);
      return invalidateDemoDependents(queryClient);
    },
  });
}

export function useClearDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearDemoData,
    onSuccess: () => {
      queryClient.setQueryData(DEMO_STATUS_KEY, { moods: 0, assessments: 0 });
      return invalidateDemoDependents(queryClient);
    },
  });
}
