import React, { useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "../../app/providers/AuthProvider";
import { setDemoMode, setDemoRole, isDemoModeActive } from "./demoMode";
import { sampleUsers, type UserProfile } from "../../shared/data/mockData";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";

interface LoginProps {
  onLogin?: (user: UserProfile) => void;
  openTerms?: () => void;
  openPrivacy?: () => void;
  openSos?: () => void;
}

export default function Login({
  onLogin,
  openTerms = () => {},
  openPrivacy = () => {},
  openSos,
}: LoginProps) {
  const { signInWithEmail, signInWithGoogle, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDemoRolePicker, setShowDemoRolePicker] = useState(false);

  const _isDemo = isDemoModeActive();

  const handleMagicLinkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !email.includes("@")) {
      setAuthError("Please enter a valid university email address.");
      return;
    }

    setIsSubmitting(true);
    setAuthError(null);

    const { error } = await signInWithEmail(email);
    setIsSubmitting(false);

    if (error) {
      setAuthError(
        `Unable to send magic link: ${error.message}. You can use Demo Mode below to preview without a backend.`
      );
    } else {
      setMagicLinkSent(true);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsSubmitting(true);
    setAuthError(null);
    const { error } = await signInWithGoogle();
    setIsSubmitting(false);
    if (error) {
      setAuthError(
        `Google SSO sign-in failed: ${error.message}. You can use Demo Mode below to preview.`
      );
    }
  };

  const handleStartDemo = (role: "student" | "counsellor" | "moderator" | "institution_admin" = "student") => {
    setDemoMode(true);
    setDemoRole(role);
    setShowDemoRolePicker(false);
    if (onLogin) {
      const match = sampleUsers.find((u) => u.email.includes(role)) || sampleUsers[0];
      onLogin(match);
    }
    navigate("/dashboard", { replace: true });
  };

  return (
    <main className="login-shell">
      {/* Top right persistent SOS Crisis button (WCAG 3.2.6) */}
      <div style={{ position: "fixed", top: 20, right: 24, zIndex: 50, display: "flex", gap: 10 }}>
        {openSos ? (
          <button
            type="button"
            className="sos-trigger-btn"
            onClick={openSos}
            title="24/7 National Emergency Helplines"
            aria-label="24/7 Emergency Crisis Helplines"
          >
            <Icon name="phone" size={15} /> SOS Helpline
          </button>
        ) : (
          <a
            href="tel:14416"
            className="sos-trigger-btn"
            title="24/7 National Emergency Helplines"
            aria-label="24/7 Emergency Crisis Helplines - Dial 14416"
          >
            <Icon name="phone" size={15} /> SOS 14416
          </a>
        )}
      </div>

      <section className="login-story">
        <div className="brand brand-light">
          <span className="brand-mark"><Icon name="heart" /></span>
          <span>MindSahaay</span>
        </div>
        <div className="story-copy">
          <span className="eyebrow">A safer space for every student</span>
          <h1>Your mind matters.<br />{"Let's care for it."}</h1>
          <p>
            Private, confidential, and judgement-free mental health support designed for university life across India.
          </p>
          <div className="trust-row">
            <span><Icon name="shield" size={18} /> Confidential & Encrypted</span>
            <span><Icon name="clock" size={18} /> 24/7 Crisis Access</span>
          </div>
        </div>
        <div className="quote-card">
          <p>“Taking care of yourself is not a distraction from your education. It is the very foundation of it.”</p>
          <span>Student Wellness Collective · Delhi University</span>
        </div>
      </section>

      <section className="login-panel">
        <div className="login-box">
          <div className="mobile-brand brand">
            <span className="brand-mark"><Icon name="heart" /></span>
            <span>MindSahaay</span>
          </div>

          <span className="eyebrow green">SECURE SUPABASE AUTH</span>
          <h2>Continue your wellness journey</h2>
          <p className="muted">Sign in with your university credentials or an email magic link.</p>

          {/* Google SSO Button */}
          <button
            type="button"
            className="social-btn"
            onClick={handleGoogleSignIn}
            disabled={isSubmitting || authLoading}
            aria-label="Sign in with Campus Google Single Sign-On"
          >
            <span className="google-g" aria-hidden="true">G</span> Continue with Campus Google SSO
          </button>

          <div className="divider"><span>or sign in with passwordless magic link</span></div>

          {authError && (
            <div
              className="care-step"
              role="alert"
              style={{
                background: "color-mix(in oklch, var(--danger) 10%, var(--white))",
                borderColor: "var(--danger)",
                marginBottom: 16,
              }}
            >
              <span className="soft-icon" style={{ background: "var(--danger)", color: "#fff" }}>
                <Icon name="x" size={16} />
              </span>
              <p style={{ color: "var(--danger)", fontSize: 13, lineHeight: 1.4 }}>{authError}</p>
            </div>
          )}

          {magicLinkSent ? (
            <div
              className="care-step"
              role="status"
              aria-live="polite"
              style={{ background: "var(--primary-soft)", borderColor: "var(--primary)", padding: 18 }}
            >
              <span className="soft-icon mint"><Icon name="check" size={20} /></span>
              <div>
                <strong style={{ fontSize: 15 }}>Magic Login Link Sent!</strong>
                <p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5 }}>
                  We sent a confidential, passwordless login link to <strong>{email}</strong>. Click the link in your inbox to enter your dashboard.
                </p>
                <button
                  type="button"
                  className="text-btn"
                  onClick={() => setMagicLinkSent(false)}
                  style={{ marginTop: 10, fontSize: 12 }}
                >
                  ← Resend or try a different email
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleMagicLinkSubmit}>
              <label className="field-label" htmlFor="user-email">
                University or Personal Email
              </label>
              <input
                id="user-email"
                type="email"
                className="social-btn"
                style={{ textAlign: "left", width: "100%", padding: "0 14px", marginBottom: 12 }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. aarav.singh@du.ac.in"
                required
                autoComplete="email"
              />
              <button
                type="submit"
                className="primary-btn full"
                disabled={isSubmitting || authLoading}
              >
                {isSubmitting ? "Sending Magic Link…" : "Send Passwordless Magic Link"} <Icon name="arrow" size={18} />
              </button>
            </form>
          )}

          {/* EXPLICIT CLEARLY-LABELLED DEMO MODE CARD */}
          <div
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 12,
              background: "oklch(0.96 0.04 85)",
              border: "1px dashed oklch(0.7 0.1 70)",
              textAlign: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
              <span aria-hidden="true">⚡</span>
              <strong style={{ fontSize: 13, color: "oklch(0.35 0.09 70)" }}>
                OFFLINE PREVIEW (SAMPLE DATA, NO ACCOUNT)
              </strong>
            </div>
            <p style={{ fontSize: 12, color: "oklch(0.4 0.05 70)", margin: "0 0 12px", lineHeight: 1.4 }}>
              Preview MindSahaay with mock student, counsellor, and moderator data without requiring live Supabase credentials.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                className="primary-btn"
                onClick={() => handleStartDemo("student")}
                style={{
                  background: "oklch(0.53 0.115 170)",
                  fontSize: 13,
                  minHeight: 38,
                  padding: "0 14px",
                }}
              >
                Offline preview (sample data, no account)
              </button>
              <button
                type="button"
                className="outline-btn"
                onClick={() => setShowDemoRolePicker(true)}
                style={{ fontSize: 13, minHeight: 38, padding: "0 14px" }}
              >
                More Roles…
              </button>
            </div>
          </div>

          <p className="terms">
            By continuing, you agree to our{" "}
            <button type="button" onClick={openTerms}>Terms of Care</button> and{" "}
            <button type="button" onClick={openPrivacy}>Privacy Policy</button>.
          </p>

          <div className="privacy-note">
            <Icon name="shield" size={20} />
            <span>
              <strong>Your privacy comes first.</strong> Your wellness data is encrypted and strictly isolated. It is never shared with your university administration, parents, or faculty.
            </span>
          </div>
        </div>
      </section>

      {/* Demo Role Picker Modal */}
      {showDemoRolePicker && (
        <Modal onClose={() => setShowDemoRolePicker(false)} ariaLabel="Select Demo Mode Role">
          <div className="modal-head">
            <div>
              <span className="eyebrow green">EXPLORE DEMO ROLES</span>
              <h3>Choose Demo Identity</h3>
            </div>
            <button className="icon-btn" onClick={() => setShowDemoRolePicker(false)} aria-label="Close modal">
              <Icon name="x" />
            </button>
          </div>

          <div className="care-plan-list">
            <button
              type="button"
              className="care-step interactive"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
              onClick={() => handleStartDemo("student")}
            >
              <div className="avatar" style={{ margin: 0 }}>AS</div>
              <div>
                <strong>Aarav Singh (Student)</strong>
                <p className="muted" style={{ fontSize: 12 }}>Undergraduate · Check-ins, PHQ-9, Chat, Journal, Stories</p>
              </div>
            </button>

            <button
              type="button"
              className="care-step interactive"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
              onClick={() => handleStartDemo("counsellor")}
            >
              <div className="avatar" style={{ margin: 0, background: "var(--lilac)" }}>AS</div>
              <div>
                <strong>Dr. Ananya Sharma (Counsellor)</strong>
                <p className="muted" style={{ fontSize: 12 }}>Campus Psychologist · View appointments & consented student contexts</p>
              </div>
            </button>

            <button
              type="button"
              className="care-step interactive"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
              onClick={() => handleStartDemo("moderator")}
            >
              <div className="avatar" style={{ margin: 0, background: "var(--amber)" }}>RV</div>
              <div>
                <strong>Rohan Verma (Community Moderator)</strong>
                <p className="muted" style={{ fontSize: 12 }}>Peer Volunteer · Review and approve submitted campus stories</p>
              </div>
            </button>

            <button
              type="button"
              className="care-step interactive"
              style={{ width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)" }}
              onClick={() => handleStartDemo("institution_admin")}
            >
              <div className="avatar" style={{ margin: 0, background: "var(--primary-dark)" }}>DW</div>
              <div>
                <strong>Dean of Student Welfare (Administrator)</strong>
                <p className="muted" style={{ fontSize: 12 }}>Institutional aggregate wellbeing indicators & stressor heatmaps</p>
              </div>
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}
