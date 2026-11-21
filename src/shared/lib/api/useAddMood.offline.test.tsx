import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { useAddMood } from "./moods";

// Regression test for a bug found in a real browser: with TanStack Query's default networkMode
// ("online") a mutation is PAUSED while the browser is offline, so addMood() (which queues the
// entry in the offline outbox) never ran and the form hung on "Saving...".
describe("useAddMood while offline", () => {
  afterEach(() => {
    onlineManager.setOnline(true);
  });

  it("is not paused when the browser is offline: the mutation function runs", async () => {
    onlineManager.setOnline(false);
    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useAddMood(), { wrapper });

    act(() => {
      // Invalid on purpose: addMood validates before touching the network or the outbox, so this
      // settles quickly with a validation error. What matters is that it RAN instead of pausing.
      result.current.mutate({ mood: "", score: 0, tags: [] } as never);
    });

    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.isPaused).toBe(false);
    expect(result.current.status).toBe("error");
    expect(client.getMutationCache().getAll()[0].options.networkMode).toBe("always");
  });
});
