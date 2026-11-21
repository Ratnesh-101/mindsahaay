import React from "react";
import { Link } from "react-router";
import Icon from "../../shared/ui/Icon";

export default function NotFound() {
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
      <section className="result-card" style={{ maxWidth: 540 }}>
        <span className="soft-icon mint large" style={{ margin: "0 auto 16px" }}>
          <Icon name="heart" size={36} />
        </span>
        <span className="eyebrow green">PAGE NOT FOUND · 404</span>
        <h1 style={{ fontSize: "28px", margin: "14px 0" }}>Take a gentle breath</h1>
        <p className="muted" style={{ lineHeight: 1.6, marginBottom: 24 }}>
          The page you are looking for does not exist or may have been moved. Let us guide you back to
          your wellness space.
        </p>

        <div className="result-actions" style={{ justifyContent: "center", gap: 12 }}>
          <Link to="/dashboard" className="primary-btn" style={{ textDecoration: "none" }}>
            <Icon name="home" size={16} /> Return to Dashboard
          </Link>
          <a
            href="tel:14416"
            className="outline-btn"
            style={{ textDecoration: "none", color: "var(--danger)", borderColor: "var(--danger)" }}
            aria-label="Call 24/7 Tele-MANAS Helpline at 14416"
          >
            <Icon name="phone" size={15} /> 24/7 Help: 14416
          </a>
        </div>
      </section>
    </main>
  );
}
