import React, { lazy, Suspense, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router";
import ProtectedRoute from "../features/auth/ProtectedRoute";
import AppLayout from "./layouts/AppLayout";
import AuthLayout from "./layouts/AuthLayout";
import Icon from "../shared/ui/Icon";
import { useAuth } from "./providers/AuthProvider";
import { isDemoModeActive, getDemoProfile } from "../features/auth/demoMode";
import { DemoDataNotice, DemoDoctorsView } from "./DemoContentFeatures";

// Lazy-loaded routes per feature for optimal chunk loading
const Login = lazy(() => import("../features/auth/Login"));
const Onboarding = lazy(() => import("../features/onboarding/Onboarding"));
const Dashboard = lazy(() => import("../features/dashboard/Dashboard"));
const MoodCheckIn = lazy(() => import("../features/mood/MoodCheckIn"));
const Assessment = lazy(() => import("../features/assessment/Assessment"));
const CrisisPage = lazy(() => import("../features/crisis/CrisisPage"));
const ConsentLedger = lazy(() => import("../features/consent/ConsentLedger"));
const Settings = lazy(() => import("../features/settings/Settings"));
const Insights = lazy(() => import("../features/insights/Insights"));
const Goodbye = lazy(() => import("../features/settings/Goodbye"));

// Existing default exports from feature folders
const Chat = lazy(() => import("../features/chat/Chat"));
const Journal = lazy(() => import("../features/journal/Journal"));
const Doctors = lazy(() => import("../features/doctors/Doctors"));
const CampusStories = lazy(() => import("../features/stories/CampusStories"));

// Institutional Role Portals & Dashboards
const CounsellorDashboard = lazy(() => import("../features/counsellor/CounsellorDashboard"));
const AdminDashboard = lazy(() => import("../features/admin/AdminDashboard"));
const CounsellorPortal = lazy(() => import("../features/dashboard/CounsellorPortal"));
const ModeratorPortal = lazy(() => import("../features/dashboard/ModeratorPortal"));
const AdminPortal = lazy(() => import("../features/dashboard/AdminPortal"));

// Modals for Chat chip actions
const BreathingModal = lazy(() => import("../features/modals/BreathingModal"));
const GroundingModal = lazy(() => import("../features/modals/GroundingModal"));

// 404 Not Found Page
const NotFound = lazy(() => import("./layouts/NotFound"));

export function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading MindSahaay feature..."
      style={{
        minHeight: "60vh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
      }}
    >
      <div>
        <span className="soft-icon mint large" style={{ margin: "0 auto 12px" }}>
          <Icon name="sparkles" size={28} />
        </span>
        <p className="muted" style={{ fontSize: 14 }}>
          Preparing your mindful space…
        </p>
      </div>
    </div>
  );
}

// 1. Chat Route with interactive chip callbacks (Breathing modal, Safety Plan, Booking)
export function ChatRoute() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isDemo = isDemoModeActive();
  const demoProfile = getDemoProfile();
  const studentId = !isDemo && user?.id ? user.id : demoProfile.id;

  const [showBreathing, setShowBreathing] = useState(false);
  const [showGrounding, setShowGrounding] = useState(false);

  return (
    <>
      <Chat
        studentId={studentId}
        onOpenBreathing={() => setShowBreathing(true)}
        onOpenSafetyPlan={() => navigate("/crisis")}
        onBookCounsellor={() => navigate("/doctors")}
        onMessageCounsellor={() => navigate("/doctors?intent=message", { state: { intent: "message" } })}
      />
      {showBreathing && (
        <BreathingModal
          onClose={() => setShowBreathing(false)}
          openGrounding={() => {
            setShowBreathing(false);
            setShowGrounding(true);
          }}
        />
      )}
      {showGrounding && (
        <GroundingModal onClose={() => setShowGrounding(false)} />
      )}
    </>
  );
}

// 2. Doctors Route with real auth session or believable demo data state
export function DoctorsRoute() {
  const { user, session } = useAuth();
  const isDemo = isDemoModeActive();
  const demoProfile = getDemoProfile();
  const studentId = !isDemo && user?.id ? user.id : demoProfile.id;

  if (isDemo && !session) {
    return <DemoDoctorsView />;
  }

  return <Doctors studentId={studentId} onBookSuccess={() => {}} />;
}

// 3. Journal Route with real auth session or believable demo data state
export function JournalRoute() {
  const { user } = useAuth();
  const isDemo = isDemoModeActive();
  const demoProfile = getDemoProfile();
  const studentId = !isDemo && user?.id ? user.id : demoProfile.id;

  return (
    <>
      {isDemo && (
        <div style={{ maxWidth: 1500, margin: "0 auto", padding: "16px 34px 0" }}>
          <DemoDataNotice message="Viewing offline demo journal entries and local-first PBKDF2 zero-knowledge vault. Client-side encryption and passphrase recovery are active." />
        </div>
      )}
      <Journal studentId={studentId} />
    </>
  );
}

// 4. Counsellor Workspace Route
export function CounsellorRoute() {
  const { session } = useAuth();
  const isDemo = isDemoModeActive();

  if (isDemo && !session) {
    return (
      <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
        <DemoDataNotice message="Viewing simulated counsellor caseload and consultations queue. Live real-time Supabase postgres_changes risk queue and encrypted notes are active in production." />
        <CounsellorPortal />
      </div>
    );
  }

  return <CounsellorDashboard />;
}

// 5. Institutional Admin Route
export function AdminRoute() {
  const { user, profile, session } = useAuth();
  const isDemo = isDemoModeActive();

  if (isDemo && !session) {
    return (
      <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
        <DemoDataNotice message="Viewing simulated institutional aggregate metrics under DPDP Act safeguards. Real-time k-anonymity matrices are computed by Supabase Edge Functions in production." />
        <AdminPortal />
      </div>
    );
  }

  return <AdminDashboard institutionId={user?.user_metadata?.institution_id || profile?.institution_id || undefined} />;
}

// 6. Community Moderator Route
export function ModeratorRoute() {
  const { session } = useAuth();
  const isDemo = isDemoModeActive();

  if (isDemo && !session) {
    return (
      <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
        <DemoDataNotice message="Viewing sample community moderation queue. Author identities are protected under DPDP Act privacy safeguards." />
        <ModeratorPortal />
      </div>
    );
  }

  return <ModeratorPortal />;
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Public Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route
            path="/login"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Login />
              </Suspense>
            }
          />
          <Route
            path="/goodbye"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Goodbye />
              </Suspense>
            }
          />
        </Route>

        {/* Onboarding & DPDP Consent Initializer (Protected) */}
        <Route element={<AuthLayout />}>
          <Route
            path="/onboarding"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <Onboarding />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        {/* Main Application Routes (Protected via useAuth & Demo Mode) */}
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            path="/dashboard"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Dashboard />
              </Suspense>
            }
          />
          <Route
            path="/mood"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <MoodCheckIn />
              </Suspense>
            }
          />
          <Route
            path="/assessment"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Assessment />
              </Suspense>
            }
          />
          <Route
            path="/chat"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ChatRoute />
              </Suspense>
            }
          />
          <Route
            path="/journal"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <JournalRoute />
              </Suspense>
            }
          />
          <Route
            path="/doctors"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <DoctorsRoute />
              </Suspense>
            }
          />
          <Route
            path="/stories"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <CampusStories onSelectStory={() => {}} />
              </Suspense>
            }
          />
          <Route
            path="/insights"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Insights />
              </Suspense>
            }
          />
          <Route
            path="/crisis"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <CrisisPage />
              </Suspense>
            }
          />
          <Route
            path="/consent"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <ConsentLedger />
              </Suspense>
            }
          />
          <Route
            path="/settings"
            element={
              <Suspense fallback={<RouteLoadingFallback />}>
                <Settings />
              </Suspense>
            }
          />

          {/* Role-Based Guarded Routes */}
          <Route
            path="/counsellor"
            element={
              <ProtectedRoute allowedRoles={["counsellor", "institution_admin", "super_admin"]}>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <CounsellorRoute />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/moderator"
            element={
              <ProtectedRoute allowedRoles={["moderator", "institution_admin", "super_admin"]}>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <ModeratorRoute />
                </Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={["institution_admin", "super_admin"]}>
                <Suspense fallback={<RouteLoadingFallback />}>
                  <AdminRoute />
                </Suspense>
              </ProtectedRoute>
            }
          />
        </Route>

        {/* 404 Catch-All Page */}
        <Route
          path="*"
          element={
            <Suspense fallback={<RouteLoadingFallback />}>
              <NotFound />
            </Suspense>
          }
        />
      </Routes>
    </Suspense>
  );
}
