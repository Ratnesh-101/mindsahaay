import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";
import * as DemoModule from "./features/auth/demoMode";

describe("App Root Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
  });

  it("mounts with all providers and renders application shell", async () => {
    render(<App />);

    // Should render without error and document language should be set
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText("Skip to main content")).toBeInTheDocument();
  });
});
