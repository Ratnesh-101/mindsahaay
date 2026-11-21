import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import EmotionExplorer, { EMOTIONS_CATALOG } from "./EmotionExplorer";

describe("EmotionExplorer Component (Name It to Tame It)", () => {
  it("renders all emotion tags from the catalog", () => {
    const props = {
      openBreathing: vi.fn(),
      openGrounding: vi.fn(),
      openAudio: vi.fn(),
      goChat: vi.fn(),
      goJournal: vi.fn(),
    };

    render(<EmotionExplorer {...props} />);

    expect(screen.getByText("FEELING EXPLORER")).toBeInTheDocument();
    expect(screen.getByText("Name It to Tame It")).toBeInTheDocument();

    for (const item of EMOTIONS_CATALOG) {
      expect(screen.getByRole("button", { name: new RegExp(item.tag, "i") })).toBeInTheDocument();
    }
  });

  it("selects an emotion and triggers the mapped micro-coping action", () => {
    const props = {
      openBreathing: vi.fn(),
      openGrounding: vi.fn(),
      openAudio: vi.fn(),
      goChat: vi.fn(),
      goJournal: vi.fn(),
    };

    render(<EmotionExplorer {...props} />);

    // Default is Overwhelmed -> breathing
    const actionBtn = screen.getByRole("button", { name: /Launch 4-7-8 Breath Reset/i });
    fireEvent.click(actionBtn);
    expect(props.openBreathing).toHaveBeenCalledTimes(1);

    // Switch to Imposter Syndrome -> journal
    const imposterBtn = screen.getByRole("button", { name: /Imposter Syndrome/i });
    fireEvent.click(imposterBtn);
    expect(screen.getByText(/You are experiencing: Imposter Syndrome/i)).toBeInTheDocument();

    const journalBtn = screen.getByRole("button", { name: /Unload in Private Journal/i });
    fireEvent.click(journalBtn);
    expect(props.goJournal).toHaveBeenCalledTimes(1);

    // Switch to Exhausted -> audio
    const exhaustedBtn = screen.getByRole("button", { name: /Exhausted/i });
    fireEvent.click(exhaustedBtn);
    const audioBtn = screen.getByRole("button", { name: /Play Monsoon Rain Soundscape/i });
    fireEvent.click(audioBtn);
    expect(props.openAudio).toHaveBeenCalledTimes(1);

    // Switch to Homesick -> chat
    const homesickBtn = screen.getByRole("button", { name: /Homesick/i });
    fireEvent.click(homesickBtn);
    const chatBtn = screen.getByRole("button", { name: /Explore Campus Peer Circles/i });
    fireEvent.click(chatBtn);
    expect(props.goChat).toHaveBeenCalledTimes(1);

    // Switch to Panicky -> grounding
    const panickyBtn = screen.getByRole("button", { name: /Panicky \/ Racing Heart/i });
    fireEvent.click(panickyBtn);
    const groundingBtn = screen.getByRole("button", { name: /Launch 5-4-3-2-1 Sensory Grounding/i });
    fireEvent.click(groundingBtn);
    expect(props.openGrounding).toHaveBeenCalledTimes(1);
  });
});
