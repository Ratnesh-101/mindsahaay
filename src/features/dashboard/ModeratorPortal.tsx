import React from "react";
import Icon from "../../shared/ui/Icon";

export default function ModeratorPortal() {
  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow green">COMMUNITY MODERATOR QUEUE</span>
          <h1>Campus Story & Peer Safety Queue</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Review submitted student stories before publication. Author real identities are never visible.
          </p>
        </div>
      </header>

      <section className="stat-grid" style={{ marginBottom: 24 }}>
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="users" /></span>
          </div>
          <p>Pending Review</p>
          <div className="stat-value">2</div>
          <small>Estimated review time: 10 mins</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="check" /></span>
          </div>
          <p>Approved This Week</p>
          <div className="stat-value">14</div>
          <small>Zero harmful content violations</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Submitted Campus Stories</h3>
            <p className="muted">Ensure peer support guidelines: no explicit self-harm methods or harassment.</p>
          </div>
        </div>

        <div className="care-plan-list">
          <div className="care-step">
            <div style={{ marginBottom: 10 }}>
              <span className="tag calm" style={{ fontSize: 11, marginBottom: 6 }}>Tag: Exam Pressure</span>
              <h4 style={{ margin: "4px 0" }}>"Overcoming the first-year semester isolation in hostel"</h4>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                "When I arrived from a small town in UP to Delhi, the noise and competition felt overwhelming. Finding the campus music club saved my peace of mind."
              </p>
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="primary-btn" style={{ fontSize: 12 }}>
                Approve Story
              </button>
              <button type="button" className="outline-btn" style={{ fontSize: 12 }}>
                Request Edit
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
