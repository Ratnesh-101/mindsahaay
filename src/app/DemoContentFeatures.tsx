import React, { useState } from "react";
import Icon from "../shared/ui/Icon";
import { doctors } from "../shared/data/mockData";
import ActivityPlanner from "../features/cbt/ActivityPlanner";
import WorryTime from "../features/cbt/WorryTime";

export function DemoDataNotice({ message }: { message: string }) {
  return (
    <div
      role="status"
      data-testid="demo-data-notice"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 18px",
        marginBottom: 20,
        borderRadius: 12,
        background: "var(--surface, #ffffff)",
        border: "1px solid var(--border, #e2dacd)",
        borderLeft: "4px solid var(--primary, #19443c)",
        color: "var(--ink, #1a2a24)",
        fontSize: 13,
        lineHeight: 1.5,
      }}
    >
      <span className="soft-icon mint" style={{ width: 30, height: 30, flexShrink: 0 }}>
        <Icon name="sparkles" size={16} />
      </span>
      <div>
        <strong>Demonstration Mode</strong> · {message}
      </div>
    </div>
  );
}

export function DemoJournalView() {
  const [tab, setTab] = useState<"entries" | "cbt">("entries");
  const [cbtSub, setCbtSub] = useState<"activity" | "worry">("activity");

  const sampleEntries = [
    {
      id: "demo-entry-1",
      title: "Mid-semester test reflections",
      date: "Today, 10:15 AM",
      mood: "Calm",
      content:
        "Took a 15-minute walk around campus after the data structures exam. Practiced 4-7-8 breathing when thoughts of perfectionism arose. Feeling more grounded now.",
      tag: "Academic Balance",
    },
    {
      id: "demo-entry-2",
      title: "Hostel evening quiet time",
      date: "Yesterday, 9:30 PM",
      mood: "Peaceful",
      content:
        "Listened to the 432Hz singing bowl soundscape in my room. Grateful for a supportive chat with my roommate Kabir over chai.",
      tag: "Social Connection",
    },
    {
      id: "demo-entry-3",
      title: "Managing morning overwhelm",
      date: "3 days ago",
      mood: "Reflective",
      content:
        "Noticed early morning restlessness about future campus placements. Parked worries in the 15-minute Worry Time exercise and focused on today.",
      tag: "CBT Reframing",
    },
  ];

  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <DemoDataNotice message="Viewing offline demo journal entries and local CBT tools. Zero-knowledge PBKDF2 vault sync is enabled with a live Supabase session." />

      <div className="directory-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow green">PRIVATE REFLECTIONS</span>
          <h1>Private Journal & CBT Tools</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Zero-knowledge client-side encryption ensures only you can ever read your thoughts.
          </p>
        </div>

        <div className="segment" role="tablist" aria-label="Journal sections">
          <button
            type="button"
            className={tab === "entries" ? "active" : ""}
            onClick={() => setTab("entries")}
            role="tab"
            aria-selected={tab === "entries"}
          >
            Sample Journal
          </button>
          <button
            type="button"
            className={tab === "cbt" ? "active" : ""}
            onClick={() => setTab("cbt")}
            role="tab"
            aria-selected={tab === "cbt"}
          >
            Interactive CBT Tools
          </button>
        </div>
      </div>

      {tab === "entries" ? (
        <div style={{ display: "grid", gap: 16 }}>
          {sampleEntries.map((entry) => (
            <article
              key={entry.id}
              className="panel"
              style={{ padding: "20px", display: "grid", gap: 8 }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span className="tag calm" style={{ fontSize: 11, marginRight: 8 }}>
                    {entry.tag}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    Mood: {entry.mood} · {entry.date}
                  </span>
                </div>
                <span className="muted" style={{ fontSize: 11 }}>
                  <Icon name="shield" size={13} /> Client-side Encrypted
                </span>
              </div>
              <h3 style={{ fontSize: 17, margin: 0 }}>{entry.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink)", margin: 0 }}>
                {entry.content}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <div>
          <div className="segment mb-4 w-fit" role="tablist" aria-label="CBT Tools">
            <button
              type="button"
              className={cbtSub === "activity" ? "active" : ""}
              onClick={() => setCbtSub("activity")}
            >
              Activity Planner
            </button>
            <button
              type="button"
              className={cbtSub === "worry" ? "active" : ""}
              onClick={() => setCbtSub("worry")}
            >
              Worry Time
            </button>
          </div>
          {cbtSub === "activity" ? <ActivityPlanner /> : <WorryTime />}
        </div>
      )}
    </div>
  );
}

export function DemoDoctorsView() {
  const [filter, setFilter] = useState("All");
  const [bookedSlot, setBookedSlot] = useState<string | null>(null);

  const filteredDoctors =
    filter === "All" ? doctors : doctors.filter((d) => d.speciality === filter);

  return (
    <div className="page" style={{ maxWidth: 960, margin: "0 auto" }}>
      <DemoDataNotice message="Viewing campus counsellors and simulated consultation slots. Live video sessions and slot booking connect to Supabase in production." />

      <header className="directory-head" style={{ marginBottom: 20 }}>
        <div>
          <span className="eyebrow green">CAMPUS SUPPORT DIRECTORY</span>
          <h1>Find a Mental Health Professional</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Confidential campus psychologists, counselling specialists, and psychiatrists.
          </p>
        </div>

        <div className="segment" role="group" aria-label="Speciality filter">
          {["All", "Psychologist", "Psychiatrist"].map((type) => (
            <button
              key={type}
              type="button"
              className={filter === type ? "active" : ""}
              onClick={() => setFilter(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </header>

      {bookedSlot && (
        <div
          role="status"
          style={{
            padding: "14px 18px",
            marginBottom: 20,
            borderRadius: 12,
            background: "color-mix(in oklch, var(--primary) 10%, var(--surface))",
            border: "1px solid var(--primary)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <strong>Simulated Appointment Confirmed!</strong>
            <p className="muted" style={{ fontSize: 13, margin: "2px 0 0" }}>
              Slot: {bookedSlot}. In production, a secure video consultation link is generated via Daily.co.
            </p>
          </div>
          <button
            type="button"
            className="text-btn"
            onClick={() => setBookedSlot(null)}
            style={{ fontSize: 13 }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        {filteredDoctors.map((doc) => (
          <article
            key={doc.name}
            className="panel"
            style={{
              padding: "20px",
              display: "grid",
              gridTemplateColumns: "auto 1fr",
              gap: 20,
              alignItems: "start",
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                background: "var(--surface)",
                border: "2px solid var(--border)",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                color: "var(--primary)",
                fontSize: 20,
              }}
            >
              {doc.name.replace("Dr. ", "").slice(0, 2).toUpperCase()}
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <h3 style={{ fontSize: 18, margin: 0 }}>{doc.name}</h3>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {doc.role} · {doc.city} ({doc.exp} experience)
                  </span>
                </div>
                <span className="tag calm" style={{ fontSize: 12 }}>
                  ★ {doc.rating} / 5.0
                </span>
              </div>

              <div style={{ marginTop: 14 }}>
                <strong style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }} className="muted">
                  Available Slots (Demo)
                </strong>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                  {doc.slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      className="outline-btn"
                      style={{ fontSize: 12, padding: "6px 12px" }}
                      onClick={() => setBookedSlot(`${doc.name} · ${slot}`)}
                    >
                      <Icon name="calendar" size={13} /> {slot}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
