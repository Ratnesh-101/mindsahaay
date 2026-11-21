import React, { useEffect, useState } from "react";
import { Navigate, useLocation, Outlet } from "react-router";
import { useAuth, type UserRole } from "../../app/providers/AuthProvider";
import { isDemoModeActive, getDemoRole } from "./demoMode";
import Icon from "../../shared/ui/Icon";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
  children?: React.ReactNode;
}

export default function ProtectedRoute({ allowedRoles, children }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();
  const location = useLocation();
  const [demoActive, setDemoActive] = useState<boolean>(() => isDemoModeActive());
  const [demoRole, setDemoRoleState] = useState<UserRole>(() => getDemoRole());

  useEffect(() => {
    const handleDemoChange = () => {
      setDemoActive(isDemoModeActive());
      setDemoRoleState(getDemoRole());
    };
    window.addEventListener("mindsahaay-demo-change", handleDemoChange);
    return () => {
      window.removeEventListener("mindsahaay-demo-change", handleDemoChange);
    };
  }, []);

  if (loading && !demoActive) {
    return (
      <div
        className="auth-loading-screen"
        role="status"
        aria-live="polite"
        aria-label="Verifying student authorization..."
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "var(--canvas)",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <span className="soft-icon mint large" style={{ margin: "0 auto 16px" }}>
            <Icon name="shield" size={32} />
          </span>
          <h2 style={{ fontSize: 20, marginBottom: 8 }}>Verifying Session…</h2>
          <p className="muted" style={{ fontSize: 14 }}>
            Ensuring confidential, encrypted access to MindSahaay.
          </p>
        </div>
      </div>
    );
  }

  // Not authenticated and not in demo mode
  if (!user && !demoActive) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Check role authorization
  const effectiveRole: UserRole = (demoActive ? demoRole : role) || "student";

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(effectiveRole)) {
    return (
      <div
        className="page focus-page"
        role="alert"
        aria-live="assertive"
        style={{ padding: "48px 24px", maxWidth: 600, margin: "0 auto" }}
      >
        <section className="result-card" style={{ textAlign: "center" }}>
          <span className="soft-icon peach large" style={{ margin: "0 auto 16px" }}>
            <Icon name="shield" size={36} />
          </span>
          <span className="eyebrow" style={{ color: "var(--amber)" }}>ACCESS RESTRICTED</span>
          <h1 style={{ fontSize: 24, margin: "12px 0" }}>Role Permission Required</h1>
          <p className="muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>
            Your active role (<strong>{effectiveRole}</strong>) does not have permission to view this
            institutional section. This area requires one of:{" "}
            <strong>{allowedRoles.join(", ")}</strong>.
          </p>
          {demoActive && (
            <p style={{ fontSize: 13, color: "var(--primary-dark)", background: "var(--primary-soft)", padding: 12, borderRadius: 8, marginBottom: 20 }}>
              Tip: In Demo Mode, switch your role using the top Demo Banner to explore this view.
            </p>
          )}
          <a href="/dashboard" className="primary-btn" style={{ textDecoration: "none", display: "inline-flex" }}>
            Return to Student Dashboard
          </a>
        </section>
      </div>
    );
  }

  return children ? <>{children}</> : <Outlet />;
}
