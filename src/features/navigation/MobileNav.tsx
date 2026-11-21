import React from "react";
import { getNavItemsForRole } from "./Sidebar";
import Icon from "../../shared/ui/Icon";
import { isDemoModeActive, getDemoRole } from "../auth/demoMode";

interface MobileNavProps {
  active: string;
  setActive: (v: string) => void;
  userRole?: string | null;
  role?: string | null;
}

export default function MobileNav({ active, setActive, userRole, role }: MobileNavProps) {
  const effectiveRole = userRole ?? role ?? (isDemoModeActive() ? getDemoRole() : null);
  const items = getNavItemsForRole(effectiveRole);

  const handleNavClick = (id: string, path?: string) => {
    setActive(id);
    if (path && typeof window !== "undefined" && window.location.pathname !== path) {
      window.history.pushState({}, "", path);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };

  // Display top key mobile actions with >= 24px targets (WCAG 2.2 AA)
  const mobileItems = items.slice(0, 5);

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {mobileItems.map((item) => {
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            type="button"
            className={isActive ? "mobile-nav-item active" : "mobile-nav-item"}
            onClick={() => handleNavClick(item.id, item.path)}
            aria-label={item.label}
            aria-current={isActive ? "page" : undefined}
            style={{ minHeight: "44px", minWidth: "44px" }}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label.split(" ")[0]}</span>
          </button>
        );
      })}
    </nav>
  );
}
