import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../../shared/ui/Icon";
import { useMoods, type MoodEntry } from "../../shared/lib/api/moods";
import {
  isVaultLocked,
  getSecureItem,
  setSecureItem,
} from "../../shared/lib/storage/secureStore";
import { INSIGHTS_NS } from "../insights/i18n";

export interface DailyMicroHabitsProps {
  initialCompleted?: string[];
  mockMoods?: MoodEntry[];
}

export default function DailyMicroHabits({
  initialCompleted,
  mockMoods,
}: DailyMicroHabitsProps = {}) {
  const { t } = useTranslation(INSIGHTS_NS);

  const getTodayKey = () => new Date().toISOString().slice(0, 10);
  const todayKey = getTodayKey();

  const defaultHabits = [
    {
      id: "h1",
      text: "Morning Sunlight & Hydration",
      desc: "Drink 500ml water and get 10 mins morning light to calibrate circadian cortisol.",
      icon: "☀️",
    },
    {
      id: "h2",
      text: "Academic Pomodoro Stretch",
      desc: "Step away from desk for 5 minutes of spine & neck decompression between study sprints.",
      icon: "🧘",
    },
    {
      id: "h3",
      text: "4-7-8 Mindful Breath Reset",
      desc: "Complete 1 conscious breathing cycle to reset the autonomic nervous system.",
      icon: "🫁",
    },
    {
      id: "h4",
      text: "Campus Peer Check-in",
      desc: "Send 1 supportive text to a hostel-mate or express appreciation to someone.",
      icon: "💬",
    },
    {
      id: "h5",
      text: "Digital Sunset Wind-Down",
      desc: "Disconnect from study screens 20 mins before sleep to protect natural melatonin.",
      icon: "🌙",
    },
  ];

  // Habits start unticked (never pre-ticked)
  const [completed, setCompleted] = useState<string[]>(() => initialCompleted ?? []);
  const [showCelebration, setShowCelebration] = useState(false);

  // Load persisted ticks for today from secureStore (if unlocked) or session state (if locked)
  useEffect(() => {
    if (initialCompleted !== undefined) return;

    let isMounted = true;

    async function loadTodayHabits() {
      const storageKey = `habits_${todayKey}`;
      const sessionKey = `mindsahaay_session_habits_${todayKey}`;

      if (isVaultLocked()) {
        try {
          const sessionVal = typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem(sessionKey)
            : null;
          if (sessionVal && isMounted) {
            const parsed = JSON.parse(sessionVal);
            if (Array.isArray(parsed)) {
              setCompleted(parsed);
              return;
            }
          }
        } catch {
          // ignore session read errors
        }
        return;
      }

      // Vault is unlocked: read from secure storage
      try {
        const result = await getSecureItem<string[]>(storageKey);
        if (!isMounted) return;

        if (result.status === "unlocked" && Array.isArray(result.value)) {
          setCompleted(result.value);
        } else {
          // Check session fallback if secure item was empty
          const sessionVal = typeof sessionStorage !== "undefined"
            ? sessionStorage.getItem(sessionKey)
            : null;
          if (sessionVal) {
            const parsed = JSON.parse(sessionVal);
            if (Array.isArray(parsed)) {
              setCompleted(parsed);
            }
          }
        }
      } catch {
        // Fallback gracefully on read error
      }
    }

    void loadTodayHabits();

    return () => {
      isMounted = false;
    };
  }, [todayKey, initialCompleted]);

  // Compute non-punitive "days checked in this fortnight" from real data
  const { data: dbMoods } = useMoods({ limit: 100 });

  const fortnightDaysCount = useMemo(() => {
    const moodsList = mockMoods !== undefined ? mockMoods : (dbMoods ?? []);
    const fortnightStart = Date.now() - 14 * 86400000;
    const uniqueDays = new Set<string>();

    moodsList.forEach((m) => {
      const t = new Date(m.created_at).getTime();
      if (t >= fortnightStart) {
        uniqueDays.add(m.created_at.slice(0, 10));
      }
    });

    // Count today if the student has marked any habit complete today
    if (completed.length > 0) {
      uniqueDays.add(todayKey);
    }

    return uniqueDays.size;
  }, [mockMoods, dbMoods, completed.length, todayKey]);

  const toggleHabit = (id: string) => {
    const isNowComplete = !completed.includes(id);
    const next = isNowComplete ? [...completed, id] : completed.filter((i) => i !== id);
    setCompleted(next);

    const storageKey = `habits_${todayKey}`;
    const sessionKey = `mindsahaay_session_habits_${todayKey}`;

    // Always update session state for immediate resilience during current session
    try {
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem(sessionKey, JSON.stringify(next));
      }
    } catch {
      // sessionStorage unavailable
    }

    // Persist to secure storage if vault is unlocked
    if (!isVaultLocked()) {
      void setSecureItem(storageKey, next);
    }

    // Non-punitive milestone celebration
    if (next.length === defaultHabits.length) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 5000);
    }
  };

  const pct = Math.round((completed.length / defaultHabits.length) * 100);

  return (
    <article className="panel microhabits-panel" aria-labelledby="microhabits-heading">
      <div className="panel-head">
        <div>
          <span className="eyebrow green">
            {t("microactionsEyebrow", "DAILY RESILIENCE BUILDERS")}
          </span>
          <h3 id="microhabits-heading">
            {t("microactionsTitle", "Mindful Habits Checklist")}
          </h3>
          <p>
            {t(
              "microactionsSubtitle",
              "Micro-actions proven to reduce cognitive overload and stabilize focus."
            )}
          </p>
        </div>

        {/* Non-punitive fortnight check-ins badge (hidden when 0) */}
        {fortnightDaysCount > 0 && (
          <div
            className="streak-badge fortnight-badge"
            title="Days active in this fortnight"
            aria-label={
              fortnightDaysCount === 1
                ? t("fortnightCheckins_one", "{{count}} day checked in this fortnight", {
                    count: fortnightDaysCount,
                  })
                : t("fortnightCheckins_other", "{{count}} days checked in this fortnight", {
                    count: fortnightDaysCount,
                  })
            }
          >
            <span className="badge-icon" aria-hidden="true">
              🌱
            </span>
            <strong>
              {fortnightDaysCount === 1
                ? t("fortnightCheckins_one", "{{count}} day checked in this fortnight", {
                    count: fortnightDaysCount,
                  })
                : t("fortnightCheckins_other", "{{count}} days checked in this fortnight", {
                    count: fortnightDaysCount,
                  })}
            </strong>
          </div>
        )}
      </div>

      <div className="habit-progress-bar-wrap">
        <div className="habit-progress-labels">
          <span>
            {t("completedRatio", "{{completed}} of {{total}} Completed", {
              completed: completed.length,
              total: defaultHabits.length,
            })}
          </span>
          <strong>{pct}%</strong>
        </div>
        <div
          className="progress"
          role="progressbar"
          aria-label="Daily habit completion progress"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <i
            style={{
              width: `${pct}%`,
              transition: "width 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
            }}
          />
        </div>
      </div>

      {showCelebration && (
        <div className="celebration-banner" aria-live="polite">
          <div className="confetti-particles" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className={`particle particle-${i % 6}`} />
            ))}
          </div>
          <span style={{ fontSize: 24 }} aria-hidden="true">
            🎉
          </span>
          <div>
            <strong>{t("dailyBalanceUnlocked", "Daily Balance Unlocked!")}</strong>
            <p>
              {t(
                "dailyBalanceDesc",
                "You prioritized every dimension of your mind today. Rest well tonight!"
              )}
            </p>
          </div>
        </div>
      )}

      <div className="microhabit-list">
        {defaultHabits.map((h) => {
          const isDone = completed.includes(h.id);
          return (
            <button
              type="button"
              key={h.id}
              className={`microhabit-item interactive ${isDone ? "done" : ""}`}
              onClick={() => toggleHabit(h.id)}
              aria-label={`${h.text}: ${isDone ? "Completed" : "Not completed"}`}
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
            >
              <span
                className={`custom-checkbox ${isDone ? "checked" : ""}`}
                aria-hidden="true"
              >
                {isDone && <Icon name="check" size={14} />}
              </span>
              <span className="habit-emoji" aria-hidden="true">
                {h.icon}
              </span>
              <div className="habit-details">
                <strong>{h.text}</strong>
                <p>{h.desc}</p>
              </div>
            </button>
          );
        })}
      </div>
    </article>
  );
}
