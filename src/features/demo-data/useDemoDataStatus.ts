import { useDemoDataCounts } from "./api";

/**
 * True while the signed-in user's account contains rows flagged is_demo = true. Read-only: it only
 * counts rows and never creates anything. Always false in the offline preview.
 */
export function useDemoDataStatus(): { hasDemo: boolean; loading: boolean } {
  const { data, isLoading } = useDemoDataCounts();
  return {
    hasDemo: data ? data.moods + data.assessments > 0 : false,
    loading: isLoading,
  };
}
