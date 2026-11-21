import React, { Component, type ErrorInfo, type ReactNode } from "react";
import Icon from "../shared/ui/Icon";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // In production, error telemetry can be recorded here without PII
    if (process.env.NODE_ENV !== "test") {
      console.error("MindSahaay Uncaught Error Boundary:", error, errorInfo);
    }
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  };

  private handleReload = (): void => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <main
          role="alert"
          aria-live="assertive"
          id="main-content"
          className="page focus-page"
          style={{
            minHeight: "100vh",
            display: "grid",
            placeItems: "center",
            padding: "40px 20px",
            textAlign: "center",
            background: "var(--bg, #fbf8f3)",
            color: "var(--ink, #1a2a24)",
          }}
        >
          <section className="result-card" style={{ maxWidth: 580, width: "100%" }}>
            <span className="soft-icon mint large" style={{ margin: "0 auto 16px" }}>
              <Icon name="heart" size={36} />
            </span>
            <span className="eyebrow green">SYSTEM RECOVERY · MINDFUL SPACE</span>
            <h1 style={{ fontSize: "26px", margin: "12px 0" }}>Take a gentle breath</h1>
            <p className="muted" style={{ lineHeight: 1.6, marginBottom: 24, fontSize: "15px" }}>
              Something unexpected happened on our end, but your well-being comes first. We have paused your
              session safely so no personal data was lost.
            </p>

            <div
              style={{
                background: "var(--surface, #ffffff)",
                border: "1px solid var(--border, #e2dacd)",
                borderRadius: "12px",
                padding: "16px 20px",
                marginBottom: "24px",
                textAlign: "left",
              }}
            >
              <strong style={{ display: "block", marginBottom: "6px", fontSize: "14px" }}>
                24/7 National Emergency & Crisis Helplines
              </strong>
              <p className="muted" style={{ fontSize: "13px", lineHeight: 1.5, marginBottom: "12px" }}>
                If you are experiencing distress, confidential human support is available immediately:
              </p>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "8px", fontSize: "13px" }}>
                <li>
                  <a
                    href="tel:14416"
                    style={{ color: "var(--primary, #19443c)", fontWeight: 600, textDecoration: "none" }}
                    aria-label="Call Tele-MANAS at 14416"
                  >
                    Tele-MANAS: 14416 / 1800-891-4416
                  </a>{" "}
                  <span className="muted">(Govt. of India, 24/7, 20+ Languages)</span>
                </li>
                <li>
                  <a
                    href="tel:18005990019"
                    style={{ color: "var(--primary, #19443c)", fontWeight: 600, textDecoration: "none" }}
                    aria-label="Call KIRAN Helpline at 1800-599-0019"
                  >
                    KIRAN Mental Health: 1800-599-0019
                  </a>{" "}
                  <span className="muted">(DEPwD, 24/7 Toll-free)</span>
                </li>
                <li>
                  <a
                    href="tel:112"
                    style={{ color: "var(--danger, #b3261e)", fontWeight: 600, textDecoration: "none" }}
                    aria-label="Call National Emergency 112"
                  >
                    National Emergency Services: 112
                  </a>
                </li>
              </ul>
            </div>

            <div className="result-actions" style={{ justifyContent: "center", gap: 12 }}>
              <button
                type="button"
                className="primary-btn"
                onClick={this.handleReset}
                style={{ cursor: "pointer" }}
              >
                <Icon name="home" size={16} /> Return to MindSahaay
              </button>
              <button
                type="button"
                className="outline-btn"
                onClick={this.handleReload}
                style={{ cursor: "pointer" }}
              >
                Reload Page
              </button>
            </div>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
