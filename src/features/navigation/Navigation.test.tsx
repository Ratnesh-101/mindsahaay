import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Sidebar, { getNavItemsForRole } from "./Sidebar";
import MobileNav from "./MobileNav";
import Header from "./Header";
import I18nProvider from "../../app/providers/I18nProvider";

describe("Role-Aware Navigation & Header Controls", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getNavItemsForRole", () => {
    it("returns student navigation items for student role", () => {
      const items = getNavItemsForRole("student");
      const ids = items.map((i) => i.id);
      expect(ids).toContain("dashboard");
      expect(ids).toContain("mood");
      expect(ids).toContain("assessment");
      expect(ids).toContain("chat");
      expect(ids).toContain("journal");
      expect(ids).toContain("doctors");
      expect(ids).toContain("stories");
      expect(ids).toContain("insights");
      expect(ids).toContain("crisis");
    });

    it("returns only Dashboard and Caseload for counsellor role", () => {
      const items = getNavItemsForRole("counsellor");
      const ids = items.map((i) => i.id);
      expect(ids).toEqual(["dashboard", "counsellor"]);
      expect(items.find((i) => i.id === "counsellor")?.label).toBe("Caseload");
    });

    it("returns Dashboard and Queue for moderator role", () => {
      const items = getNavItemsForRole("moderator");
      const ids = items.map((i) => i.id);
      expect(ids).toEqual(["dashboard", "moderator"]);
      expect(items.find((i) => i.id === "moderator")?.label).toBe("Queue");
    });

    it("returns Dashboard and Analytics for institution_admin role", () => {
      const items = getNavItemsForRole("institution_admin");
      const ids = items.map((i) => i.id);
      expect(ids).toEqual(["dashboard", "admin"]);
      expect(items.find((i) => i.id === "admin")?.label).toBe("Analytics");
    });
  });

  describe("Sidebar Component", () => {
    it("renders counsellor role items when counsellor role is passed", () => {
      render(
        <Sidebar
          active="dashboard"
          setActive={vi.fn()}
          logout={vi.fn()}
          openPrivacy={vi.fn()}
          userRole="counsellor"
        />
      );

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Caseload" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Private Journal" })).not.toBeInTheDocument();
    });

    it("renders moderator role items when moderator role is passed", () => {
      render(
        <Sidebar
          active="dashboard"
          setActive={vi.fn()}
          logout={vi.fn()}
          openPrivacy={vi.fn()}
          userRole="moderator"
        />
      );

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Queue" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mental Screeners" })).not.toBeInTheDocument();
    });

    it("renders institution_admin role items when institution_admin role is passed", () => {
      render(
        <Sidebar
          active="dashboard"
          setActive={vi.fn()}
          logout={vi.fn()}
          openPrivacy={vi.fn()}
          userRole="institution_admin"
        />
      );

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Analytics" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Mood Log" })).not.toBeInTheDocument();
    });
  });

  describe("MobileNav Component", () => {
    it("renders role-specific mobile actions for counsellor", () => {
      render(<MobileNav active="dashboard" setActive={vi.fn()} userRole="counsellor" />);

      expect(screen.getByRole("button", { name: "Dashboard" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Caseload" })).toBeInTheDocument();
    });
  });

  describe("Header Controls", () => {
    it("renders visible language toggle and switches between English and Hindi", () => {
      const mockUser = {
        name: "Aarav Singh",
        email: "aarav@du.ac.in",
        institution: "Delhi University",
        initials: "AS",
      };

      render(
        <I18nProvider>
          <Header
            active="dashboard"
            currentUser={mockUser}
            darkMode={false}
            toggleDarkMode={vi.fn()}
            ambientSound="off"
            toggleAmbientSound={vi.fn()}
            openSos={vi.fn()}
            openNotification={vi.fn()}
            openSettings={vi.fn()}
          />
        </I18nProvider>
      );

      const langToggle = screen.getByTestId("header-language-toggle");
      expect(langToggle).toBeInTheDocument();

      fireEvent.click(langToggle);
      expect(document.documentElement.lang).toBe("hi");

      fireEvent.click(langToggle);
      expect(document.documentElement.lang).toBe("en");
    });

    it("triggers openSos when SOS Helpline button is clicked", () => {
      const mockOpenSos = vi.fn();
      const mockUser = {
        name: "Aarav Singh",
        email: "aarav@du.ac.in",
        institution: "Delhi University",
        initials: "AS",
      };

      render(
        <I18nProvider>
          <Header
            active="dashboard"
            currentUser={mockUser}
            darkMode={false}
            toggleDarkMode={vi.fn()}
            ambientSound="off"
            toggleAmbientSound={vi.fn()}
            openSos={mockOpenSos}
            openNotification={vi.fn()}
            openSettings={vi.fn()}
          />
        </I18nProvider>
      );

      const sosBtn = screen.getByRole("button", { name: /24\/7 Emergency Crisis Helplines/i });
      fireEvent.click(sosBtn);
      expect(mockOpenSos).toHaveBeenCalledTimes(1);
    });

    it("dispatches popstate event when navigating to a new path in MobileNav", () => {
      const setActive = vi.fn();
      const popStateListener = vi.fn();
      window.addEventListener("popstate", popStateListener);

      render(<MobileNav active="dashboard" setActive={setActive} userRole="student" />);

      const moodBtn = screen.getByRole("button", { name: "Mood Log" });
      fireEvent.click(moodBtn);

      expect(setActive).toHaveBeenCalledWith("mood");
      expect(popStateListener).toHaveBeenCalled();

      window.removeEventListener("popstate", popStateListener);
    });
  });
});
