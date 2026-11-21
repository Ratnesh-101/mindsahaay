import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "./ErrorBoundary";

function ProblematicChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Simulated mental health widget error");
  }
  return <div>Healthy Space Content</div>;
}

describe("Global ErrorBoundary", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when no error occurs", () => {
    render(
      <ErrorBoundary>
        <ProblematicChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Healthy Space Content")).toBeInTheDocument();
  });

  it("catches render errors, displays calm message and 24/7 emergency helplines", () => {
    // Suppress console.error in test output for intentional error throw
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Take a gentle breath/i)).toBeInTheDocument();

    // Verify 24/7 Indian Crisis Helplines are prominently displayed
    expect(screen.getByText(/Tele-MANAS: 14416/i)).toBeInTheDocument();
    expect(screen.getByText(/KIRAN Mental Health: 1800-599-0019/i)).toBeInTheDocument();
    expect(screen.getByText(/National Emergency Services: 112/i)).toBeInTheDocument();

    // Verify Return to MindSahaay recovery action is rendered
    expect(screen.getByRole("button", { name: /Return to MindSahaay/i })).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it("renders custom fallback if provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<div>Custom Serene Fallback</div>}>
        <ProblematicChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Custom Serene Fallback")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });
});
