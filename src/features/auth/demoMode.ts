import type { UserRole, UserProfile } from "../../app/providers/AuthProvider";

export const DEMO_USERS: Record<UserRole, UserProfile> = {
  student: {
    id: "demo-student-uuid-0001",
    role: "student",
    alias: "Aarav Singh",
    locale: "en",
    institution_id: "delhi-university-main",
    avatar_seed: "aarav",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  counsellor: {
    id: "demo-counsellor-uuid-0002",
    role: "counsellor",
    alias: "Dr. Ananya Sharma",
    locale: "en",
    institution_id: "delhi-university-main",
    avatar_seed: "ananya",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  moderator: {
    id: "demo-moderator-uuid-0003",
    role: "moderator",
    alias: "Rohan Verma",
    locale: "en",
    institution_id: "delhi-university-main",
    avatar_seed: "rohan",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  institution_admin: {
    id: "demo-admin-uuid-0004",
    role: "institution_admin",
    alias: "Dean of Student Welfare",
    locale: "en",
    institution_id: "delhi-university-main",
    avatar_seed: "dean",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  super_admin: {
    id: "demo-superadmin-uuid-0005",
    role: "super_admin",
    alias: "Platform Administrator",
    locale: "en",
    institution_id: null,
    avatar_seed: "super",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
};

const DEMO_MODE_STORAGE_KEY = "mindsahaay_demo_mode";
const DEMO_ROLE_STORAGE_KEY = "mindsahaay_demo_role";

// Clean up any legacy localStorage keys immediately on module load so stale sessions never persist
if (typeof window !== "undefined" && window.localStorage) {
  try {
    window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    window.localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
  } catch {
    // ignore storage access errors
  }
}

export function isDemoModeActive(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const envVal = typeof import.meta !== "undefined" && import.meta.env?.VITE_DEMO_MODE;
  if (envVal === "true" || envVal === true) {
    return true;
  }
  // Guarantee any legacy localStorage items are purged
  try {
    if (localStorage.getItem(DEMO_MODE_STORAGE_KEY) !== null) {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
    }
  } catch {
    // ignore
  }
  return sessionStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
}

export function setDemoMode(active: boolean): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
      localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (active) {
      sessionStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
    } else {
      sessionStorage.removeItem(DEMO_MODE_STORAGE_KEY);
      sessionStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
    }
    window.dispatchEvent(new Event("mindsahaay-demo-change"));
  }
}

export function getDemoRole(): UserRole {
  if (typeof window !== "undefined") {
    try {
      if (localStorage.getItem(DEMO_ROLE_STORAGE_KEY) !== null) {
        localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
    const stored = sessionStorage.getItem(DEMO_ROLE_STORAGE_KEY) as UserRole | null;
    if (stored && stored in DEMO_USERS) {
      return stored;
    }
  }
  return "student";
}

export function setDemoRole(role: UserRole): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(DEMO_ROLE_STORAGE_KEY);
    } catch {
      // ignore
    }
    sessionStorage.setItem(DEMO_ROLE_STORAGE_KEY, role);
    window.dispatchEvent(new Event("mindsahaay-demo-change"));
  }
}

export function getDemoProfile(): UserProfile {
  const role = getDemoRole();
  return DEMO_USERS[role] || DEMO_USERS.student;
}
