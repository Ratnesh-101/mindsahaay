import React from "react";
import Icon from "../../shared/ui/Icon";

export default function CounsellorPortal() {
  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow green">CAMPUS COUNSELLOR WORKSPACE</span>
          <h1>Appointments & Student Care Queue</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Confidential view of your scheduled student consultations. Only consented context is visible.
          </p>
        </div>
      </header>

      <section className="stat-grid" style={{ marginBottom: 24 }}>
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="calendar" /></span>
          </div>
          <p>Upcoming Sessions</p>
          <div className="stat-value">3</div>
          <small>Next: Today at 4:30 PM</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="shield" /></span>
          </div>
          <p>Consented Care Contexts</p>
          <div className="stat-value">2</div>
          <small>Students shared recent PHQ bands</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon peach"><Icon name="phone" /></span>
          </div>
          <p>Urgent Care Flagged</p>
          <div className="stat-value">0</div>
          <small>No active crisis alerts assigned</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Scheduled Consultations</h3>
            <p className="muted">Student privacy protected under Mental Healthcare Act 2017.</p>
          </div>
        </div>

        <div className="care-plan-list">
          <div className="care-step" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Student Alias: Aarav · Delhi University</strong>
              <p className="muted" style={{ fontSize: 13 }}>Today, 4:30 PM (45 mins) · Booking note: Mid-semester test anxiety</p>
            </div>
            <a href="tel:14416" className="primary-btn" style={{ fontSize: 13 }}>
              Join Video Room
            </a>
          </div>

          <div className="care-step" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <strong>Student Alias: Priya · IIT Bombay</strong>
              <p className="muted" style={{ fontSize: 13 }}>Tomorrow, 11:00 AM (45 mins) · Consented PHQ-9 Band: Mild</p>
            </div>
            <button type="button" className="outline-btn" style={{ fontSize: 13 }}>
              View Consented Summary
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
