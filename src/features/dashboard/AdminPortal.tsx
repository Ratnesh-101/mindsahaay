import React from "react";
import Icon from "../../shared/ui/Icon";

export default function AdminPortal() {
  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <header className="directory-head" style={{ marginBottom: 24 }}>
        <div>
          <span className="eyebrow green">INSTITUTIONAL WELLBEING AGGREGATE</span>
          <h1>Dean of Student Welfare Dashboard</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            High-level cohort trends and anonymized health indicators under DPDP Act privacy safeguards.
            Zero individual student identification is possible.
          </p>
        </div>
      </header>

      <section className="stat-grid" style={{ marginBottom: 24 }}>
        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon mint"><Icon name="users" /></span>
          </div>
          <p>Total Participating Students</p>
          <div className="stat-value">1,420</div>
          <small>Cohort minimum threshold: 10+ met (k-anonymity, k ≥ 10)</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon lilac"><Icon name="chart" /></span>
          </div>
          <p>Campus Wellbeing Average</p>
          <div className="stat-value">74<span>/100</span></div>
          <small>+6 points vs pre-exam period</small>
        </article>

        <article className="stat-card">
          <div className="stat-top">
            <span className="soft-icon peach"><Icon name="calendar" /></span>
          </div>
          <p>Counsellor Utilization</p>
          <div className="stat-value">84%</div>
          <small>Average wait time: 1.4 days</small>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h3>Campus Stressor Heatmap (De-identified)</h3>
            <p className="muted">Anonymized theme distribution across academic quarters.</p>
          </div>
        </div>

        <div className="support-bars">
          {[
            ["Exam & Placement Pressure", 68],
            ["Hostel Life & Homesickness", 42],
            ["Sleep Irregularity", 54],
            ["Peer Relationships", 28],
          ].map(([theme, pct]) => (
            <div key={String(theme)}>
              <span>{theme}</span>
              <div className="progress"><i style={{ width: `${pct}%` }} /></div>
              <strong>{pct}%</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
