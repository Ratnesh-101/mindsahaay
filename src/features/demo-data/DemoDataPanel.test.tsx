import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import i18n from "i18next";
import DemoDataPanel from "./DemoDataPanel";
import { useDemoDataStatus } from "./useDemoDataStatus";
import * as DemoModule from "../auth/demoMode";
import { makeBackend, makeFakeSupabase, makeQueryClient, Providers, type FakeBackend } from "./testSupport";

const state = vi.hoisted(() => ({ fake: null as unknown }));

vi.mock("../../shared/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../shared/lib/supabase")>();
  return {
    ...actual,
    supabase: new Proxy(
      {},
      { get: (_t, prop) => (state.fake as Record<string, unknown>)[prop as string] },
    ),
  };
});

let backend: FakeBackend;

function renderPanel(variant?: "card" | "inline") {
  const client = makeQueryClient();
  const utils = render(
    <Providers client={client}>
      <DemoDataPanel variant={variant} />
    </Providers>,
  );
  return { client, ...utils };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  backend = makeBackend();
  state.fake = makeFakeSupabase(backend);
  vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(false);
  await i18n.changeLanguage("en");
});

afterEach(async () => {
  await i18n.changeLanguage("en");
});

describe("DemoDataPanel", () => {
  it("shows the explanation and a Load button when the account has no demo rows", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: /load demo data/i })).toBeEnabled();
    expect(screen.getByRole("heading", { name: "Demo data" })).toBeInTheDocument();
    expect(
      screen.getByText(/Adds about 30 days of sample check-ins and 3 sample screenings/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Your own entries are never changed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear demo data/i })).toBeNull();
  });

  it("never calls the load RPC just by rendering the panel or the status hook", async () => {
    function Probe() {
      const s = useDemoDataStatus();
      return <span data-testid="probe">{String(s.hasDemo)}</span>;
    }
    const client = makeQueryClient();
    render(
      <Providers client={client}>
        <DemoDataPanel />
        <DemoDataPanel variant="inline" />
        <Probe />
      </Providers>,
    );
    await screen.findAllByRole("button", { name: /load demo data/i });
    await waitFor(() => expect(screen.getByTestId("probe")).toHaveTextContent("false"));
    expect(backend.rpcCalls).toEqual([]);
  });

  it("loads demo data on button press, announces success, then offers Clear (idempotent state)", async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /load demo data/i }));

    expect(await screen.findByText(/Demo data loaded: 26 sample check-ins and 3 sample screenings/)).toBeInTheDocument();
    expect(await screen.findByText("Demo data is loaded")).toBeInTheDocument();
    expect(screen.getByTestId("demo-data-counts")).toHaveTextContent(
      "Sample check-ins: 26 · Sample screenings: 3",
    );
    expect(screen.queryByRole("button", { name: /^load demo data/i })).toBeNull();
    expect(screen.getByRole("button", { name: /clear demo data/i })).toBeEnabled();
    expect(backend.rpcCalls).toEqual(["load_demo_data"]);
  });

  it("disables the button and marks it busy while the load is running", async () => {
    let release: (() => void) | undefined;
    const fake = makeFakeSupabase(backend);
    const originalRpc = fake.rpc;
    fake.rpc = (name: string) =>
      new Promise((resolve) => {
        release = () => resolve(originalRpc(name));
      });
    state.fake = fake;

    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /load demo data/i }));
    const busy = await screen.findByRole("button", { name: /loading demo data/i });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    release?.();
    expect(await screen.findByText("Demo data is loaded")).toBeInTheDocument();
  });

  it("surfaces a load error in an alert region and claims no success", async () => {
    backend.rpcError = { message: "permission denied", code: "42501", status: 403 };
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /load demo data/i }));

    const alert = await screen.findByText(/Demo data could not be loaded\. Nothing was added/);
    expect(alert.closest('[role="alert"]')).not.toBeNull();
    expect(screen.queryByText(/Demo data loaded:/)).toBeNull();
    expect(screen.getByRole("button", { name: /load demo data/i })).toBeEnabled();
  });

  it("says the feature is unavailable when the RPC does not exist", async () => {
    backend.rpcError = { message: "Could not find the function", code: "PGRST202", status: 404 };
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /load demo data/i }));
    expect(await screen.findByText(/not available on this server yet/)).toBeInTheDocument();
  });

  it("does not claim success when the RPC answers in an unexpected shape", async () => {
    backend.rpcPayload = { ok: true };
    renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: /load demo data/i }));
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
    expect(screen.queryByText("Demo data is loaded")).toBeNull();
  });

  it("asks the user to sign in when there is no session on a button press", async () => {
    renderPanel();
    const button = await screen.findByRole("button", { name: /load demo data/i });
    backend.signedIn = false;
    fireEvent.click(button);
    expect(await screen.findByText("Please sign in again to use demo data.")).toBeInTheDocument();
    expect(backend.rpcCalls).toEqual([]);
  });

  describe("when demo rows already exist", () => {
    beforeEach(() => {
      backend.counts = { mood_entries: 26, assessments: 3 };
    });

    it("shows the loaded state with counts and a Clear button, but no Load button", async () => {
      renderPanel("inline");
      expect(await screen.findByText("Demo data is loaded")).toBeInTheDocument();
      expect(screen.getByTestId("demo-data-counts")).toHaveTextContent("26");
      expect(screen.getByRole("button", { name: /clear demo data/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^load demo data/i })).toBeNull();
    });

    it("cancel in the confirmation dialog does nothing", async () => {
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: /clear demo data/i }));
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByText("This removes only the sample data. Your own entries stay.")).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(backend.rpcCalls).toEqual([]);
      expect(screen.getByText("Demo data is loaded")).toBeInTheDocument();
    });

    it("Escape and the close button also dismiss without clearing", async () => {
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: /clear demo data/i }));
      await screen.findByRole("dialog");
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

      fireEvent.click(screen.getByRole("button", { name: /clear demo data/i }));
      fireEvent.click(await screen.findByRole("button", { name: "Close" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(backend.rpcCalls).toEqual([]);
    });

    it("confirming clears only demo data and then offers Load again", async () => {
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: /clear demo data/i }));
      fireEvent.click(await screen.findByRole("button", { name: /yes, clear demo data/i }));

      expect(await screen.findByText(/Demo data cleared: 26 sample check-ins and 3 sample screenings removed/)).toBeInTheDocument();
      expect(screen.getByText(/Your own entries were not changed/)).toBeInTheDocument();
      expect(await screen.findByRole("button", { name: /load demo data/i })).toBeInTheDocument();
      expect(backend.rpcCalls).toEqual(["clear_demo_data"]);
    });

    it("surfaces a clear error and keeps the Clear button", async () => {
      backend.rpcError = { message: "network", code: "500", status: 500 };
      renderPanel();
      fireEvent.click(await screen.findByRole("button", { name: /clear demo data/i }));
      fireEvent.click(await screen.findByRole("button", { name: /yes, clear demo data/i }));
      expect(await screen.findByText(/Demo data could not be cleared\. Nothing was removed/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /clear demo data/i })).toBeEnabled();
    });
  });

  it("shows an error with a retry when the presence check fails", async () => {
    backend.statusError = true;
    renderPanel();
    expect(await screen.findByText("Could not check whether demo data is loaded.")).toBeInTheDocument();
    backend.statusError = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("button", { name: /load demo data/i })).toBeInTheDocument();
  });

  it("does not call the backend in the offline preview and offers no buttons", async () => {
    vi.spyOn(DemoModule, "isDemoModeActive").mockReturnValue(true);
    const getSession = vi.spyOn(
      (state.fake as ReturnType<typeof makeFakeSupabase>).auth,
      "getSession",
    );
    renderPanel();
    expect(await screen.findByText("This preview already uses sample data")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(getSession).not.toHaveBeenCalled();
    expect(backend.rpcCalls).toEqual([]);
  });

  it("renders Hindi strings when the language is Hindi", async () => {
    await i18n.changeLanguage("hi");
    renderPanel();
    expect(await screen.findByRole("button", { name: "डेमो डेटा लोड करें" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "डेमो डेटा" })).toBeInTheDocument();
  });
});
