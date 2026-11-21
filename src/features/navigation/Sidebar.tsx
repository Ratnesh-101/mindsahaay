import React from "react";
import Icon, { type IconName } from "../../shared/ui/Icon";
import { isDemoModeActive, getDemoRole } from "../auth/demoMode";

export interface NavItemConfig {
  id: string;
  label: string;
  icon: IconName;
  path?: string;
  badge?: string;
}

export const MAIN_NAV_ITEMS: NavItemConfig[] = [
  { id: "dashboard", label: "Overview", icon: "home", path: "/dashboard" },
  { id: "mood", label: "Mood Log", icon: "sparkles", path: "/mood" },
  { id: "assessment", label: "Mental Screeners", icon: "test", path: "/assessment" },
  { id: "chat", label: "MindMate AI", icon: "chat", path: "/chat", badge: "AI" },
  { id: "journal", label: "Private Journal", icon: "book", path: "/journal" },
  { id: "doctors", label: "Counsellors", icon: "doctors", path: "/doctors" },
  { id: "stories", label: "Campus Stories", icon: "users", path: "/stories" },
  { id: "insights", label: "Insights", icon: "chart", path: "/insights" },
  { id: "crisis", label: "Safety Plan", icon: "shield", path: "/crisis" },
];

export function getNavItemsForRole(role?: string | null): NavItemConfig[] {
  switch (role) {
    case "counsellor":
      return [
        { id: "dashboard", label: "Dashboard", icon: "home", path: "/dashboard" },
        { id: "counsellor", label: "Caseload", icon: "doctors", path: "/counsellor" },
      ];
    case "moderator":
      return [
        { id: "dashboard", label: "Dashboard", icon: "home", path: "/dashboard" },
        { id: "moderator", label: "Queue", icon: "shield", path: "/moderator" },
      ];
    case "institution_admin":
      return [
        { id: "dashboard", label: "Dashboard", icon: "home", path: "/dashboard" },
        { id: "admin", label: "Analytics", icon: "chart", path: "/admin" },
      ];
    case "super_admin":
      return [
        ...MAIN_NAV_ITEMS,
        { id: "counsellor", label: "Caseload", icon: "doctors", path: "/counsellor" },
        { id: "moderator", label: "Queue", icon: "shield", path: "/moderator" },
        { id: "admin", label: "Analytics", icon: "chart", path: "/admin" },
      ];
    case "student":
    default:
      return MAIN_NAV_ITEMS;
  }
}

interface SidebarProps {
  active: string;
  setActive: (v: string) => void;
  logout: () => void;
  openPrivacy: () => void;
  userRole?: string | null;
  role?: string | null;
}

export default function Sidebar({
  active,
  setActive,
  logout,
  openPrivacy,
  userRole,
  role,
}: SidebarProps) {
  const effectiveRole = userRole ?? role ?? (isDemoModeActive() ? getDemoRole() : null);
  const navItems = getNavItemsForRole(effectiveRole);

  const handleNavClick = (id: string, path?: string) => {
    setActive(id);
    if (path && typeof window !== "undefined" && window.location.pathname !== path) {
      // If history is present, router will pick it up or pushState
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  return (
    <aside className="sidebar" aria-label="Main Navigation">
      <div className="brand">
        <span className="brand-mark"><Icon name="heart" /></span>
        <span>MindSahaay</span>
      </div>
      <nav aria-label="Primary" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {navItems.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={isActive ? "nav-item active" : "nav-item"}
              onClick={() => handleNavClick(item.id, item.path)}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge && <i>{item.badge}</i>}
            </button>
          );
        })}
      </nav>

      {/* Immediate Helpline Sidebar Widget */}
      <div className="side-support" role="complementary" aria-label="Urgent support contact">
        <span className="support-icon"><Icon name="phone" /></span>
        <strong>Need urgent support?</strong>
        <p>Talk to a trained counsellor right now (24/7 KIRAN Helpline).</p>
        <a href="tel:18005990019" className="helpline-link-btn" aria-label="Call 24/7 KIRAN Helpline 1800-599-0019">
          Call 1800-599-0019
        </a>
      </div>

      <button
        type="button"
        className="nav-item"
        onClick={openPrivacy}
        style={{ marginTop: 8 }}
        aria-label="Privacy and Data Rights"
      >
        <Icon name="shield" />
        <span>Privacy & Consent</span>
      </button>

      <button
        type="button"
        className="nav-item logout"
        onClick={logout}
        aria-label="Sign out of current account"
      >
        <Icon name="logout" />
        <span>Sign out</span>
      </button>
    </aside>
  );
}
