import React from "react";
import { act } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "i18next";

vi.mock("../../audio/EnhancedAudioEngine", () => ({
  enhancedAudio: {
    getCurrentTrack: vi.fn(() => "off"),
    playMonsoonRain: vi.fn(),
    playTibetanBowl: vi.fn(),
    playSolfeggio528: vi.fn(),
    playDeltaBinaural: vi.fn(),
    stop: vi.fn(),
    setVolume: vi.fn(),
    setSleepTimer: vi.fn(),
  },
}));

import { setupI18n } from "../journal/testSupport";
import { enhancedAudio } from "../../audio/EnhancedAudioEngine";
import BreathingModal, { nextTick } from "../modals/BreathingModal";
import GroundingModal from "../modals/GroundingModal";
import CarePlanModal from "../modals/CarePlanModal";
import AudioSanctuaryModal from "../modals/AudioSanctuaryModal";

beforeAll(async () => {
  await setupI18n("en");
});

afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await i18n.changeLanguage("en");
});

describe("4-7-8 breathing", () => {
  it("steps inhale 4, hold 7, exhale 8 for four cycles and then stops", () => {
    let s = { phase: "inhale" as const, count: 4, cycle: 1, finished: false } as ReturnType<typeof nextTick>;
    const trace: string[] = [];
    for (let i = 0; i < 200 && !s.finished; i++) {
      s = nextTick(s);
      trace.push(`${s.phase}${s.count}c${s.cycle}`);
    }
    expect(s.finished).toBe(true);
    expect(s.cycle).toBe(4);
    expect(trace.length).toBe(19 * 4);
    expect(trace).toContain("hold7c1");
    expect(trace).toContain("exhale8c1");
    expect(nextTick(s)).toBe(s);
  });

  it("announces phases politely, can be paused, and closes", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onClose = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<BreathingModal onClose={onClose} openGrounding={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "4-7-8 breathing tool" })).toBeInTheDocument();
    const guidance = screen.getByRole("status");
    expect(guidance).toHaveAttribute("aria-live", "polite");
    expect(guidance).toHaveTextContent(/^Inhale\./);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(guidance).toHaveTextContent(/^Hold\./);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(guidance).toHaveTextContent(/^Hold\./);
    await user.click(screen.getByRole("button", { name: "Resume" }));

    await user.click(screen.getByRole("button", { name: "Finish reset" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("finishes after all cycles with a completion message", () => {
    vi.useFakeTimers();
    render(<BreathingModal onClose={() => undefined} openGrounding={() => undefined} />);
    act(() => {
      vi.advanceTimersByTime(19 * 4 * 1000 + 2000);
    });
    expect(screen.getByRole("status")).toHaveTextContent("Well done");
    expect(screen.queryByRole("button", { name: "Pause" })).not.toBeInTheDocument();
  });

  it("disables circle motion and says so when the user prefers reduced motion", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    const { container } = render(<BreathingModal onClose={() => undefined} openGrounding={() => undefined} />);
    const circle = container.querySelector(".breath-circle") as HTMLElement;
    expect(circle.style.animation).toBe("none");
    expect(circle.style.transition).toBe("none");
    expect(circle.style.transform).toBe("none");
    expect(screen.getByText(/Reduced motion is on/)).toBeInTheDocument();
  });

  it("hands over to grounding", async () => {
    const onClose = vi.fn();
    const openGrounding = vi.fn();
    const user = userEvent.setup();
    render(<BreathingModal onClose={onClose} openGrounding={openGrounding} />);
    await user.click(screen.getByRole("button", { name: /5-4-3-2-1 sensory grounding/ }));
    expect(onClose).toHaveBeenCalled();
    expect(openGrounding).toHaveBeenCalled();
  });

  it("closes with Escape and the labelled close button", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BreathingModal onClose={onClose} openGrounding={() => undefined} />);
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Close breathing tool" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe("grounding, care plan and audio modals", () => {
  it("toggles grounding items as real pressed buttons", async () => {
    const user = userEvent.setup();
    render(<GroundingModal onClose={() => undefined} />);
    const item = screen.getByRole("button", { name: /Laptop or notebook/ });
    expect(item).toHaveAttribute("aria-pressed", "false");
    await user.click(item);
    expect(item).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThan(10);
  });

  it("care plan leads to counsellors and is not a diagnosis", async () => {
    const onClose = vi.fn();
    const goDoctors = vi.fn();
    const user = userEvent.setup();
    render(<CarePlanModal onClose={onClose} goDoctors={goDoctors} />);
    expect(screen.getByText(/not a diagnosis or treatment plan/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Connect with a counsellor/ }));
    expect(onClose).toHaveBeenCalled();
    expect(goDoctors).toHaveBeenCalled();
  });

  it("plays and stops soundscapes with accessible toggle buttons and a timer", async () => {
    const user = userEvent.setup();
    render(<AudioSanctuaryModal onClose={() => undefined} />);
    await user.click(screen.getByRole("button", { name: "15 minute timer" }));
    const play = screen.getByRole("button", { name: "Play Monsoon rain" });
    await user.click(play);
    expect(enhancedAudio.playMonsoonRain).toHaveBeenCalledWith(0.7);
    expect(enhancedAudio.setSleepTimer).toHaveBeenCalledWith(15, expect.any(Function));
    expect(screen.getByRole("button", { name: "Stop Monsoon rain" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Fades out in 15:00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop Monsoon rain" }));
    expect(enhancedAudio.stop).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Play 432 Hz singing bowl" }));
    expect(enhancedAudio.playTibetanBowl).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Continuous playback" }));
    expect(enhancedAudio.setSleepTimer).toHaveBeenCalledWith(0);
  });
});

describe("Hindi", () => {
  it("renders the modals in Hindi when the language changes", async () => {
    await setupI18n("hi");
    render(<CarePlanModal onClose={() => undefined} goDoctors={() => undefined} />);
    expect(screen.getByRole("dialog", { name: "आपकी देखभाल योजना के सुझाव" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "देखभाल योजना बंद करें" })).toBeInTheDocument();
  });
});
