import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MoodCheckIn from "./MoodCheckIn";
import QueryProvider from "../../app/providers/QueryProvider";
import I18nProvider from "../../app/providers/I18nProvider";
import * as DemoModule from "../auth/demoMode";

describe("MoodCheckIn Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);

    // Mock ResizeObserver for Recharts in JSDOM
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  function renderMoodCheckIn() {
    return render(
      <QueryProvider>
        <I18nProvider>
          <MoodCheckIn />
        </I18nProvider>
      </QueryProvider>
    );
  }

  it("renders 5-point mood scale, emotion tags, and notes textarea", () => {
    renderMoodCheckIn();

    expect(screen.getByText("How are you feeling today?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Rough/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Low/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Okay/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Good/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Great/i })).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Anxious" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calm" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Private notes/i)).toBeInTheDocument();
  });

  it("triggers crisis support alert when crisis words are typed into notes", async () => {
    renderMoodCheckIn();

    const notesArea = screen.getByLabelText(/Private notes/i);
    fireEvent.change(notesArea, { target: { value: "i want to end my life right now" } });

    // FR-MOOD-05: System shall run crisis check on free-text mood notes
    expect(
      await screen.findByText(/Immediate Crisis Support Available/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/We noticed phrases of acute distress in your notes/i)
    ).toBeInTheDocument();

    // Verified one-tap helpline links
    const teleManas = screen.getByRole("link", { name: /Call Tele-MANAS \(14416\)/i });
    expect(teleManas).toHaveAttribute("href", "tel:14416");

    const kiran = screen.getByRole("link", { name: /Call KIRAN \(1800-599-0019\)/i });
    expect(kiran).toHaveAttribute("href", "tel:18005990019");

    const emergency = screen.getByRole("link", { name: /Emergency 112/i });
    expect(emergency).toHaveAttribute("href", "tel:112");
  });

  it("submits daily mood check-in and provides clinician suggestion", async () => {
    renderMoodCheckIn();

    // Select "Good"
    const goodBtn = screen.getByRole("button", { name: /Good/i });
    fireEvent.click(goodBtn);

    // Toggle "Grateful" tag
    const gratefulTag = screen.getByRole("button", { name: "Grateful" });
    fireEvent.click(gratefulTag);

    // Add note
    const notesArea = screen.getByLabelText(/Private notes/i);
    fireEvent.change(notesArea, { target: { value: "Finished my project presentation" } });

    // Submit
    const submitBtn = screen.getByRole("button", { name: /Log Daily Mood/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/Mood logged successfully!/i)).toBeInTheDocument();
    });

    // Clinician suggestion visible
    expect(screen.getByText(/Positive Momentum Reflection/i)).toBeInTheDocument();
  });

  it("toggles trend durations and displays accessible data table fallback", () => {
    renderMoodCheckIn();

    const thirtyDaysBtn = screen.getByRole("button", { name: "30 Days" });
    fireEvent.click(thirtyDaysBtn);
    expect(thirtyDaysBtn).toHaveClass("active");

    // Accessible table
    expect(screen.getByText(/View accessible data table alternative/i)).toBeInTheDocument();
  });
});
