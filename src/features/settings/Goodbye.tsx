import React from "react";
import { Link } from "react-router";
import Icon from "../../shared/ui/Icon";

export default function Goodbye() {
  return (
    <main
      id="main-content"
      className="page focus-page"
      role="main"
      style={{
        minHeight: "80vh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        padding: "48px 20px",
      }}
    >
      <section className="result-card" style={{ maxWidth: 560 }}>
        <span className="soft-icon mint large" style={{ margin: "0 auto 16px" }}>
          <Icon name="shield" size={36} />
        </span>
        <span className="eyebrow green">DATA PERMANENTLY ERASED · DPDP ACT 2023</span>
        <h1 style={{ fontSize: "28px", margin: "14px 0" }}>Your data has been wiped</h1>
        <p className="muted" style={{ lineHeight: 1.6, marginBottom: 20 }}>
          Under Section 12 of the India Digital Personal Data Protection (DPDP) Act 2023, your account,
          mood history, screening assessments, local CBT records, and encryption keys have been
          permanently and irrevocably erased. Zero traces remain on your device or our servers.
        </p>

        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "24px",
            textAlign: "left",
          }}
        >
          <strong style={{ display: "block", marginBottom: "8px", fontSize: "14px" }}>
            24/7 Emergency & Crisis Helplines
          </strong>
          <p className="muted" style={{ fontSize: "13px", lineHeight: 1.5, marginBottom: "12px" }}>
            Even without a MindSahaay account, immediate and confidential mental health support is always
            available to you across India:
          </p>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px", fontSize: "13px" }}>
            <li>
              <a
                href="tel:14416"
                style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}
                aria-label="Call Tele-MANAS at 14416"
              >
                Tele-MANAS: 14416 / 1800-891-4416
              </a>{" "}
              <span className="muted">(Govt. of India, 24/7, 20+ Languages)</span>
            </li>
            <li>
              <a
                href="tel:18005990019"
                style={{ color: "var(--primary)", fontWeight: 600, textDecoration: "none" }}
                aria-label="Call KIRAN Helpline at 1800-599-0019"
              >
                KIRAN Mental Health: 1800-599-0019
              </a>{" "}
              <span className="muted">(DEPwD, 24/7 Toll-free)</span>
            </li>
            <li>
              <a
                href="tel:112"
                style={{ color: "var(--danger)", fontWeight: 600, textDecoration: "none" }}
                aria-label="Call Emergency 112"
              >
                National Emergency Services: 112
              </a>
            </li>
          </ul>
        </div>

        <div className="result-actions" style={{ justifyContent: "center", gap: 12 }}>
          <Link to="/login" className="primary-btn" style={{ textDecoration: "none" }}>
            <Icon name="arrow" size={16} /> Return to MindSahaay Login
          </Link>
        </div>
      </section>
    </main>
  );
}
