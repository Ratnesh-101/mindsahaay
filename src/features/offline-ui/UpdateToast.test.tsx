import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import I18nProvider, { i18n } from "../../app/providers/I18nProvider";
import UpdateToast from "./UpdateToast";

function wrap() {
  return render(
    <I18nProvider>
      <UpdateToast />
    </I18nProvider>,
  );
}

function fireUpdate(apply?: () => void) {
  act(() => {
    window.dispatchEvent(new CustomEvent("mindsahaay:sw-update", { detail: { apply } }));
  });
}

describe("UpdateToast", () => {
  it("renders nothing until the update event arrives", () => {
    wrap();
    expect(screen.queryByTestId("update-toast")).toBeNull();
  });

  it("shows a polite status with both actions after the event", () => {
    wrap();
    fireUpdate(vi.fn());
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent(/new version/i);
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
  });

  it("Refresh now calls detail.apply once and disables the buttons", () => {
    wrap();
    const apply = vi.fn();
    fireUpdate(apply);
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeDisabled();
    expect(screen.getByTestId("update-toast")).toHaveTextContent(/updating/i);
  });

  it("Later hides the toast without applying", () => {
    wrap();
    const apply = vi.fn();
    fireUpdate(apply);
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByTestId("update-toast")).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });

  it("shows again for a later update event", () => {
    wrap();
    fireUpdate(vi.fn());
    fireEvent.click(screen.getByRole("button", { name: "Later" }));
    fireUpdate(vi.fn());
    expect(screen.getByTestId("update-toast")).toBeInTheDocument();
  });

  it("survives an event without apply and an apply that throws", () => {
    wrap();
    fireUpdate(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    fireUpdate(() => {
      throw new Error("x");
    });
    fireEvent.click(screen.getByRole("button", { name: "Refresh now" }));
    expect(screen.getByRole("button", { name: "Refresh now" })).not.toBeDisabled();
  });

  it("is bilingual and keeps 24px targets", async () => {
    wrap();
    await act(async () => {
      await i18n.changeLanguage("hi");
    });
    fireUpdate(vi.fn());
    expect(screen.getByRole("button", { name: "अभी रीफ़्रेश करें" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "बाद में" })).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "अभी रीफ़्रेश करें" });
    expect(parseInt(btn.style.minHeight, 10)).toBeGreaterThanOrEqual(24);
    expect(parseInt(btn.style.minWidth, 10)).toBeGreaterThanOrEqual(24);
    await act(async () => {
      await i18n.changeLanguage("en");
    });
  });

  it("does not cover the fixed bottom-right corner", () => {
    wrap();
    fireUpdate(vi.fn());
    const style = screen.getByTestId("update-toast").style;
    expect(style.left).toBe("16px");
    expect(style.right).toBe("");
  });
});
