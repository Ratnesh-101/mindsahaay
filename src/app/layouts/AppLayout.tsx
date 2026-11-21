import React, { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import DemoBanner from "./DemoBanner";
import Header from "../../features/navigation/Header";
import Sidebar from "../../features/navigation/Sidebar";
import MobileNav from "../../features/navigation/MobileNav";
import SosModal from "../../features/modals/SosModal";
import SafetyCardModal from "../../features/modals/SafetyCardModal";
import PrivacyModal from "../../features/modals/PrivacyModal";
import NotificationModal from "../../features/modals/NotificationModal";
import TermsModal from "../../features/modals/TermsModal";
import { useAuth } from "../providers/AuthProvider";
import { isDemoModeActive, getDemoProfile } from "../../features/auth/demoMode";
import { audioEngine } from "../../audio/EnhancedAudioEngine";
import { SyncChip, OfflineBanner, UpdateToast, useLogoutGuard } from "../../features/offline-ui";
import { initOutbox } from "../../shared/lib/offline";
import { warmCrisisConsentCache } from "../../features/chat/api";
import type { UserProfile as MockUserProfile } from "../../shared/data/mockData";

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();

  const isDemo = isDemoModeActive();
  const activeProfile = isDemo ? getDemoProfile() : profile;

  // Active navigation key based on current pathname
  const [active, setActive] = useState<string>("dashboard");

  useEffect(() => {
    const path = location.pathname.replace(/^\//, "") || "dashboard";
    setActive(path);
  }, [location.pathname]);

  // Dark Mode state
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("mindsahaay-theme") === "dark";
    }
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("mindsahaay-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("mindsahaay-theme", "light");
    }
  }, [darkMode]);

  // Ambient soundscape state
  const [ambientSound, setAmbientSound] = useState<"off" | "rain" | "bowl">("off");

  const toggleAmbientSound = () => {
    if (ambientSound === "off") {
      audioEngine.startRain();
      setAmbientSound("rain");
    } else if (ambientSound === "rain") {
      audioEngine.startSingingBowl();
      setAmbientSound("bowl");
    } else {
      audioEngine.stop();
      setAmbientSound("off");
    }
  };

  // Modals state
  const [activeModal, setActiveModal] = useState<
    "sos" | "safetyCard" | "notification" | "privacy" | "terms" | null
  >(null);

  const performLogout = async () => {
    audioEngine.stop();
    if (!isDemo) {
      await signOut();
    }
    navigate("/login", { replace: true });
  };

  // Unsynced offline entries are never dropped silently: the guard asks first.
  // Session expiry does not pass through here (documented limitation); items stay encrypted
  // on the device and the outbox purges them after 7 days.
  const outboxUserId = user?.id || activeProfile?.id || "demo-student-id";

  // Start the offline outbox for the signed-in user: purge items older than 7 days, flush now
  // if online, and flush again whenever the connection returns. Only for a real session; in
  // demo mode there is nothing to sync. The cleanup removes the listener on logout or user change.
  useEffect(() => {
    if (!user?.id) return undefined;
    // Also fill the crisis-consent cache while online, so a crisis that happens offline is queued
    // immediately instead of after a network lookup (see logChatCrisisEvent).
    void warmCrisisConsentCache();
    const warm = () => void warmCrisisConsentCache();
    window.addEventListener("online", warm);
    const stopOutbox = initOutbox(user.id);
    return () => {
      window.removeEventListener("online", warm);
      stopOutbox();
    };
  }, [user?.id]);
  const { requestLogout: handleLogout, dialog: logoutGuardDialog } = useLogoutGuard(
    outboxUserId,
    performLogout,
  );

  const handleNavigate = (navId: string) => {
    setActive(navId);
    navigate(`/${navId}`);
  };

  // Format user profile for Header
  const headerUser: MockUserProfile = {
    name: activeProfile?.alias || user?.email?.split("@")[0] || "Student",
    email: user?.email || "student@du.ac.in",
    institution: activeProfile?.institution_id ? "Delhi University" : "Campus Student",
    initials: (activeProfile?.alias || "AS").slice(0, 2).toUpperCase(),
  };

  return (
    <>
      {/* WCAG 2.2 AA Skip Link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Demo Mode Banner */}
      <DemoBanner />

      <div className="app-shell" lang="en">
        <Sidebar
          active={active}
          setActive={handleNavigate}
          logout={handleLogout}
          openPrivacy={() => setActiveModal("privacy")}
          userRole={activeProfile?.role || "student"}
        />

        <main className="content" id="main-content" tabIndex={-1}>
          <Header
            active={active}
            currentUser={headerUser}
            darkMode={darkMode}
            toggleDarkMode={() => setDarkMode(!darkMode)}
            ambientSound={ambientSound}
            toggleAmbientSound={toggleAmbientSound}
            openSos={() => setActiveModal("sos")}
            openNotification={() => setActiveModal("notification")}
            openSettings={() => navigate("/settings")}
            openSafetyCard={() => setActiveModal("safetyCard")}
          />

          <div className="offline-ui-strip">
            <SyncChip userId={outboxUserId} />
            <OfflineBanner />
            <UpdateToast />
          </div>

          <Outlet />
        </main>

        {/* Mobile Navigation */}
        <MobileNav
          active={active}
          setActive={handleNavigate}
          userRole={activeProfile?.role || "student"}
        />

        {/* Global Modals in Our Scope */}
        {activeModal === "sos" && (
          <SosModal
            onClose={() => setActiveModal(null)}
            openSafetyCard={() => setActiveModal("safetyCard")}
          />
        )}
        {activeModal === "safetyCard" && (
          <SafetyCardModal
            student={{ name: headerUser.name, institution: headerUser.institution }}
            onClose={() => setActiveModal(null)}
          />
        )}
        {activeModal === "notification" && (
          <NotificationModal onClose={() => setActiveModal(null)} />
        )}
        {activeModal === "privacy" && (
          <PrivacyModal
            studentId={activeProfile?.id || "demo-student-id"}
            onClose={() => setActiveModal(null)}
          />
        )}
        {logoutGuardDialog}
        {activeModal === "terms" && (
          <TermsModal onClose={() => setActiveModal(null)} />
        )}
      </div>
    </>
  );
}
