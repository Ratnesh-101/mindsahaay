import React, { useEffect, useRef, useState } from "react";
import { isDemoModeActive, getDemoRole, setDemoRole, setDemoMode } from "../../features/auth/demoMode";
import type { UserRole } from "../providers/AuthProvider";

export default function DemoBanner() {
  const [active, setActive] = useState<boolean>(() => isDemoModeActive());
  const [role, setRole] = useState<UserRole>(() => getDemoRole());

  useEffect(() => {
    const handleUpdate = () => {
      setActive(isDemoModeActive());
      setRole(getDemoRole());
    };
    window.addEventListener("mindsahaay-demo-change", handleUpdate);
    return () => {
      window.removeEventListener("mindsahaay-demo-change", handleUpdate);
    };
  }, []);

  // Publish the banner height as --demo-banner-h so the fixed sidebar and sticky header sit
  // below it instead of underneath it. Removed again when the banner is not shown.
  const barRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const el = barRef.current;
    if (!active || !el) {
      root.style.removeProperty("--demo-banner-h");
      return;
    }
    const publish = () => root.style.setProperty("--demo-banner-h", `${el.offsetHeight}px`);
    publish();
    window.addEventListener("resize", publish);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(publish) : null;
    ro?.observe(el);
    return () => {
      window.removeEventListener("resize", publish);
      ro?.disconnect();
      root.style.removeProperty("--demo-banner-h");
    };
  }, [active]);

  if (!active) return null;

  return (
    <aside
      ref={barRef}
      className="demo-banner-bar"
      role="region"
      aria-label="Demo mode notification and role switcher"
      style={{
        background: "oklch(0.92 0.08 85)",
        color: "oklch(0.25 0.08 70)",
        borderBottom: "1px solid oklch(0.82 0.10 80)",
        padding: "8px 16px",
        fontSize: "13px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        zIndex: 100,
        position: "sticky",
        top: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span aria-hidden="true" style={{ fontSize: "16px" }}>⚠️</span>
        <strong>DEMO MODE ACTIVE</strong>
        <span>· Running offline with mock data (backend disconnected)</span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <label htmlFor="demo-role-select" style={{ fontWeight: 600 }}>
          Preview Role:
        </label>
        <select
          id="demo-role-select"
          value={role}
          onChange={(e) => setDemoRole(e.target.value as UserRole)}
          aria-label="Switch preview role in demo mode"
          style={{
            padding: "4px 8px",
            borderRadius: "6px",
            border: "1px solid oklch(0.75 0.08 70)",
            background: "#fff",
            color: "#000",
            fontWeight: 600,
            fontSize: "12px",
          }}
        >
          <option value="student">Student (Aarav Singh)</option>
          <option value="counsellor">Counsellor (Dr. Ananya Sharma)</option>
          <option value="moderator">Moderator (Rohan Verma)</option>
          <option value="institution_admin">Dean of Student Welfare</option>
        </select>

        <button
          type="button"
          onClick={() => {
            setDemoMode(false);
            window.location.href = "/login";
          }}
          aria-label="Exit demo mode and go to live login"
          style={{
            padding: "4px 10px",
            borderRadius: "6px",
            border: "1px solid oklch(0.7 0.1 70)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "12px",
          }}
        >
          Exit Demo
        </button>
      </div>
    </aside>
  );
}
