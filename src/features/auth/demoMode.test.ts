import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isDemoModeActive,
  setDemoMode,
  getDemoRole,
  setDemoRole,
  getDemoProfile,
} from "./demoMode";

describe("Session-Scoped Demo Mode Contract", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("defaults to inactive when sessionStorage and env are empty", () => {
    expect(isDemoModeActive()).toBe(false);
  });

  it("stores active flag in sessionStorage and never persists in localStorage", () => {
    setDemoMode(true);

    expect(sessionStorage.getItem("mindsahaay_demo_mode")).toBe("true");
    expect(localStorage.getItem("mindsahaay_demo_mode")).toBeNull();
    expect(isDemoModeActive()).toBe(true);

    setDemoMode(false);
    expect(sessionStorage.getItem("mindsahaay_demo_mode")).toBeNull();
    expect(isDemoModeActive()).toBe(false);
  });

  it("stores preview role in sessionStorage and cleans legacy localStorage keys", () => {
    setDemoRole("counsellor");

    expect(sessionStorage.getItem("mindsahaay_demo_role")).toBe("counsellor");
    expect(localStorage.getItem("mindsahaay_demo_role")).toBeNull();
    expect(getDemoRole()).toBe("counsellor");

    const profile = getDemoProfile();
    expect(profile.role).toBe("counsellor");
    expect(profile.alias).toBe("Dr. Ananya Sharma");
  });

  it("migrates and removes stale legacy localStorage keys on query", () => {
    // Simulate leftover keys from a previous app version in localStorage
    localStorage.setItem("mindsahaay_demo_mode", "true");
    localStorage.setItem("mindsahaay_demo_role", "moderator");

    // With nothing in sessionStorage, isDemoModeActive must return false and purge localStorage
    expect(isDemoModeActive()).toBe(false);
    expect(localStorage.getItem("mindsahaay_demo_mode")).toBeNull();

    // getDemoRole purges legacy key and returns default student
    expect(getDemoRole()).toBe("student");
    expect(localStorage.getItem("mindsahaay_demo_role")).toBeNull();
  });

  it("dispatches mindsahaay-demo-change window event on mode or role update", () => {
    const listener = vi.fn();
    window.addEventListener("mindsahaay-demo-change", listener);

    setDemoMode(true);
    expect(listener).toHaveBeenCalledTimes(1);

    setDemoRole("institution_admin");
    expect(listener).toHaveBeenCalledTimes(2);

    window.removeEventListener("mindsahaay-demo-change", listener);
  });
});
