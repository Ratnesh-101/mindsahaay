import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import I18nProvider, { i18n } from "../../app/providers/I18nProvider";
import SyncChip from "./SyncChip";
import OfflineBanner from "./OfflineBanner";
import { useLogoutGuard } from "./LogoutGuardDialog";
import { formatVerifiedDate } from "./i18n";
import * as offline from "../../shared/lib/offline";

vi.mock("../../shared/lib/offline", () => ({
  useOnlineStatus: vi.fn(),
  useOutboxStatus: vi.fn(),
  flushOutbox: vi.fn(),
  hasUnsynced: vi.fn(),
  resolveUnsyncedOnLogout: vi.fn(),
}));

const m = vi.mocked(offline) as unknown as {
  useOnlineStatus: ReturnType<typeof vi.fn>;
  useOutboxStatus: ReturnType<typeof vi.fn>;
  flushOutbox: ReturnType<typeof vi.fn>;
  hasUnsynced: ReturnType<typeof vi.fn>;
  resolveUnsyncedOnLogout: ReturnType<typeof vi.fn>;
};

const status = (over: Partial<offline.OutboxStatus> = {}) => ({
  pending: 0,
  riskEvents: 0,
  moods: 0,
  lastSyncAt: null,
  syncing: false,
  ...over,
});

function wrap(ui: React.ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.useOnlineStatus.mockReturnValue(true);
  m.useOutboxStatus.mockReturnValue(status());
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SyncChip", () => {
  it("is hidden (no visible chip) when nothing is pending", () => {
    wrap(<SyncChip userId="u1" />);
    expect(screen.queryByRole("button", { name: /sync now/i })).toBeNull();
    // The live region stays mounted so later changes are announced.
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("shows the pending count in a polite live region with a Sync now button", async () => {
    m.useOutboxStatus.mockReturnValue(status({ pending: 3, riskEvents: 1, moods: 2 }));
    m.flushOutbox.mockResolvedValue({ sent: 3, failed: 0, skipped: 0 });
    wrap(<SyncChip userId="u1" />);
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveTextContent("3 items waiting to sync");
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(m.flushOutbox).toHaveBeenCalledWith("u1"));
  });

  it("uses the singular for one item", () => {
    m.useOutboxStatus.mockReturnValue(status({ pending: 1 }));
    wrap(<SyncChip userId="u1" />);
    expect(screen.getByRole("status")).toHaveTextContent("1 item waiting to sync");
  });

  it("shows 'Synced just now' briefly after a successful flush, then hides", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    m.useOutboxStatus.mockReturnValue(status({ pending: 2 }));
    m.flushOutbox.mockResolvedValue({ sent: 2, failed: 0, skipped: 0 });
    const { rerender } = wrap(<SyncChip userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    m.useOutboxStatus.mockReturnValue(status({ pending: 0, lastSyncAt: "2026-11-20T10:00:00Z" }));
    rerender(
      <I18nProvider>
        <SyncChip userId="u1" />
      </I18nProvider>,
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Synced just now"));
    await act(async () => {
      vi.advanceTimersByTime(4500);
    });
    expect(screen.getByRole("status")).not.toHaveTextContent("Synced just now");
  });

  it("tells the student when some items could not be sent", async () => {
    m.useOutboxStatus.mockReturnValue(status({ pending: 2 }));
    m.flushOutbox.mockResolvedValue({ sent: 0, failed: 2, skipped: 0 });
    wrap(<SyncChip userId="u1" />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(screen.getByText(/could not be sent yet/i)).toBeInTheDocument());
  });

  it("disables Sync now while syncing", () => {
    m.useOutboxStatus.mockReturnValue(status({ pending: 2, syncing: true }));
    wrap(<SyncChip userId="u1" />);
    expect(screen.getByRole("button", { name: "Syncing…" })).toBeDisabled();
  });
});

describe("OfflineBanner", () => {
  it("renders nothing while online", () => {
    wrap(<OfflineBanner />);
    expect(screen.queryByTestId("offline-banner")).toBeNull();
  });

  it("shows the message and the three helplines as tel links when offline", () => {
    m.useOnlineStatus.mockReturnValue(false);
    wrap(<OfflineBanner />);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(/You are offline\. Helplines and your safety plan still work/);
    expect(banner).toHaveTextContent(/keyword safety layer/);
    expect(screen.getByRole("link", { name: /Tele-MANAS.*14416/ })).toHaveAttribute("href", "tel:14416");
    expect(screen.getByRole("link", { name: /KIRAN.*1800-599-0019/ })).toHaveAttribute("href", "tel:18005990019");
    expect(screen.getByRole("link", { name: /Emergency.*112/ })).toHaveAttribute("href", "tel:112");
  });

  it("can be dismissed and reappears on the next offline event", () => {
    m.useOnlineStatus.mockReturnValue(false);
    const view = wrap(<OfflineBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss offline notice/i }));
    expect(screen.queryByTestId("offline-banner")).toBeNull();

    m.useOnlineStatus.mockReturnValue(true);
    view.rerender(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>,
    );
    m.useOnlineStatus.mockReturnValue(false);
    view.rerender(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>,
    );
    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });

  it("has no duplicate or unnamed interactive elements", () => {
    m.useOnlineStatus.mockReturnValue(false);
    wrap(<OfflineBanner />);
    for (const el of [...screen.getAllByRole("link"), ...screen.getAllByRole("button")]) {
      expect(el).toHaveAccessibleName();
    }
  });
});

describe("Logout guard", () => {
  function Harness({ proceed }: { proceed: () => void }) {
    const { requestLogout, dialog } = useLogoutGuard("u1", proceed);
    return (
      <>
        <button type="button" onClick={() => void requestLogout()}>
          Log out
        </button>
        {dialog}
      </>
    );
  }

  it("logs out straight away when nothing is unsynced", async () => {
    m.hasUnsynced.mockResolvedValue(0);
    const proceed = vi.fn();
    wrap(<Harness proceed={proceed} />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
  });

  async function openDialog(proceed = vi.fn()) {
    m.hasUnsynced.mockResolvedValue(3);
    m.resolveUnsyncedOnLogout.mockResolvedValue(undefined);
    wrap(<Harness proceed={proceed} />);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    const dialog = await screen.findByRole("alertdialog");
    return { dialog, proceed };
  }

  it("shows the count and exactly three choices, and does not log out yet", async () => {
    const { dialog, proceed } = await openDialog();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleName("3 entries haven't synced");
    const buttons = screen.getAllByRole("button").filter((b) => dialog.contains(b));
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Stay signed in",
      "Keep encrypted on this device for up to 7 days",
      "Discard",
    ]);
    expect(proceed).not.toHaveBeenCalled();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
  });

  it("traps Tab, ignores a click outside, and always shows the helplines", async () => {
    const { dialog, proceed } = await openDialog();
    const stay = screen.getByRole("button", { name: "Stay signed in" });
    await waitFor(() => expect(stay).toHaveFocus());

    fireEvent.click(screen.getByTestId("logout-guard-backdrop"));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(proceed).not.toHaveBeenCalled();

    // The three helplines are inside the dialog as call links.
    const block = screen.getByTestId("logout-guard-helplines");
    expect(block.querySelector('a[href="tel:14416"]')).not.toBeNull();
    expect(block.querySelector('a[href="tel:18005990019"]')).not.toBeNull();
    expect(block.querySelector('a[href="tel:112"]')).not.toBeNull();

    // Tab stays inside the dialog (focus wraps from the last focusable item back to the first).
    const items = Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"));
    items[items.length - 1].focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(items[items.length - 1]).toHaveFocus();
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("Escape is the safe option: it stays signed in and deletes nothing (G6-SEC-03)", async () => {
    const { proceed } = await openDialog();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(proceed).not.toHaveBeenCalled();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
  });

  it("Escape on the discard confirmation goes back instead of discarding", async () => {
    await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("button", { name: "Stay signed in" })).toBeInTheDocument();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
  });

  it("Stay signed in cancels logout and deletes nothing", async () => {
    const { proceed } = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(proceed).not.toHaveBeenCalled();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
  });

  it("Keep resolves with 'keep' and then continues logout", async () => {
    const { proceed } = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: /keep encrypted on this device/i }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(m.resolveUnsyncedOnLogout).toHaveBeenCalledWith("u1", "keep");
  });

  it("Discard needs a second confirmation before anything is deleted", async () => {
    const { proceed } = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();
    expect(proceed).not.toHaveBeenCalled();
    expect(screen.getByText("Discard these entries for good?")).toBeInTheDocument();

    // Going back deletes nothing.
    fireEvent.click(screen.getByRole("button", { name: "Go back" }));
    expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
    expect(m.resolveUnsyncedOnLogout).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, discard and sign out" }));
    await waitFor(() => expect(proceed).toHaveBeenCalledTimes(1));
    expect(m.resolveUnsyncedOnLogout).toHaveBeenCalledWith("u1", "discard");
  });

  it("keeps the dialog open if resolving fails (nothing is silently lost)", async () => {
    const { proceed } = await openDialog();
    m.resolveUnsyncedOnLogout.mockRejectedValue(new Error("db"));
    fireEvent.click(screen.getByRole("button", { name: /keep encrypted on this device/i }));
    await waitFor(() => expect(m.resolveUnsyncedOnLogout).toHaveBeenCalled());
    expect(proceed).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });
});

describe("Hindi strings", () => {
  it("renders the banner in Hindi with the helpline numbers unchanged", async () => {
    m.useOnlineStatus.mockReturnValue(false);
    await i18n.changeLanguage("hi");
    try {
      wrap(<OfflineBanner />);
      expect(screen.getByRole("status")).toHaveTextContent("आप ऑफ़लाइन हैं");
      expect(screen.getByRole("link", { name: /14416/ })).toHaveAttribute("href", "tel:14416");
    } finally {
      await i18n.changeLanguage("en");
    }
  });
});

describe("formatVerifiedDate", () => {
  it("formats the ISO date per locale without timezone drift", () => {
    expect(formatVerifiedDate("2026-11-20", "en")).toMatch(/20 November 2026/);
    expect(formatVerifiedDate("2026-11-20", "hi")).toMatch(/2026/);
    expect(formatVerifiedDate("garbage", "en")).toBe("garbage");
  });
});
