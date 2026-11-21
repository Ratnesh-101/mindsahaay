import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import SosModal from "./SosModal";
import SafetyCardModal from "./SafetyCardModal";
import I18nProvider from "../../app/providers/I18nProvider";

describe("Safety Critical Modals (SosModal & SafetyCardModal)", () => {
  describe("SosModal Emergency Support Dialog", () => {
    it("renders mandatory Indian crisis helplines with direct dialing links", () => {
      const onClose = vi.fn();
      render(
        <I18nProvider>
          <SosModal onClose={onClose} />
        </I18nProvider>
      );

      expect(screen.getByText("24/7 Emergency Support")).toBeInTheDocument();
      expect(screen.getByText(/IMMEDIATE CRISIS ASSISTANCE/i)).toBeInTheDocument();

      // Tele-MANAS (14416)
      const teleManas = screen.getByRole("link", { name: /Call Tele-MANAS 14416/i });
      expect(teleManas).toHaveAttribute("href", "tel:14416");

      // KIRAN (1800-599-0019)
      const kiran = screen.getByRole("link", { name: /Call KIRAN Helpline 1800-599-0019/i });
      expect(kiran).toHaveAttribute("href", "tel:18005990019");

      // Vandrevala Foundation
      const vandrevala = screen.getByRole("link", { name: /Call Vandrevala Foundation/i });
      expect(vandrevala).toHaveAttribute("href", "tel:9999666555");

      // Emergency 112
      const emergency = screen.getByRole("link", { name: /Dial Emergency Services 112/i });
      expect(emergency).toHaveAttribute("href", "tel:112");

      // Close modal
      const closeBtn = screen.getByRole("button", { name: /Close modal/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("triggers openSafetyCard when view safety plan is clicked", () => {
      const openSafetyCard = vi.fn();
      render(
        <I18nProvider>
          <SosModal onClose={vi.fn()} openSafetyCard={openSafetyCard} />
        </I18nProvider>
      );

      const safetyPlanBtn = screen.getByRole("button", { name: /View & Print My Sahaay Safety Card/i });
      fireEvent.click(safetyPlanBtn);
      expect(openSafetyCard).toHaveBeenCalledTimes(1);
    });
  });

  describe("SafetyCardModal", () => {
    it("renders grounding anchors and emergency protocol", () => {
      const onClose = vi.fn();
      render(
        <I18nProvider>
          <SafetyCardModal
            student={{ name: "Aarav", institution: "Delhi University" }}
            onClose={onClose}
          />
        </I18nProvider>
      );

      expect(screen.getByText("My Sahaay Safety Card")).toBeInTheDocument();
      expect(screen.getByText(/Ice water on face & wrists/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Close modal/i })).toBeInTheDocument();
    });
  });
});
