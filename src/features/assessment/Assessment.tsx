import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import Icon from "../../shared/ui/Icon";
import {
  useAssessments,
  useSubmitAssessment,
  scoreAssessmentLocally,
  type AssessmentInstrument,
  type AssessmentItem,
} from "../../shared/lib/api/assessments";
import { PHQ4_DISCLAIMER } from "../../domain/scoring/phq4";
import { PHQ9_DISCLAIMER } from "../../domain/scoring/phq9";
import { GAD7_DISCLAIMER } from "../../domain/scoring/gad7";
import { isDemoModeActive } from "../auth/demoMode";

const PHQ4_QUESTIONS = [
  { sub: "GAD-2 Anxiety", text: "Feeling nervous, anxious, or on edge" },
  { sub: "GAD-2 Anxiety", text: "Not being able to stop or control worrying" },
  { sub: "PHQ-2 Mood", text: "Little interest or pleasure in doing things" },
  { sub: "PHQ-2 Mood", text: "Feeling down, depressed, or hopeless" },
];

const PHQ9_QUESTIONS = [
  { sub: "PHQ-9 Depression", text: "Little interest or pleasure in doing things" },
  { sub: "PHQ-9 Depression", text: "Feeling down, depressed, or hopeless" },
  { sub: "PHQ-9 Depression", text: "Trouble falling or staying asleep, or sleeping too much" },
  { sub: "PHQ-9 Depression", text: "Feeling tired or having little energy" },
  { sub: "PHQ-9 Depression", text: "Poor appetite or overeating" },
  { sub: "PHQ-9 Depression", text: "Feeling bad about yourself — or that you are a failure or have let yourself or your family down" },
  { sub: "PHQ-9 Depression", text: "Trouble concentrating on things, such as reading, coursework, or lectures" },
  { sub: "PHQ-9 Depression", text: "Moving or speaking so slowly that other people noticed, or being fidgety/restless" },
  { sub: "PHQ-9 Critical Safety Item", text: "Thoughts that you would be better off dead, or of hurting yourself in some way" },
];

const GAD7_QUESTIONS = [
  { sub: "GAD-7 Anxiety", text: "Feeling nervous, anxious, or on edge" },
  { sub: "GAD-7 Anxiety", text: "Not being able to stop or control worrying" },
  { sub: "GAD-7 Anxiety", text: "Worrying too much about different things" },
  { sub: "GAD-7 Anxiety", text: "Trouble relaxing" },
  { sub: "GAD-7 Anxiety", text: "Being so restless that it's hard to sit still" },
  { sub: "GAD-7 Anxiety", text: "Becoming easily annoyed or irritable" },
  { sub: "GAD-7 Anxiety", text: "Feeling afraid, as if something awful might happen" },
];

const ANSWER_OPTIONS = [
  { label: "Not at all", score: 0 },
  { label: "Several days", score: 1 },
  { label: "More than half the days", score: 2 },
  { label: "Nearly every day", score: 3 },
];

interface AssessmentProps {
  studentId?: string;
  goDoctors?: () => void;
  openCarePlan?: () => void;
  openSafetyPlan?: () => void;
}

export default function Assessment({
  goDoctors,
  openCarePlan,
  openSafetyPlan,
}: AssessmentProps) {
  const [instrument, setInstrument] = useState<AssessmentInstrument>("phq9");
  const [step, setStep] = useState<number>(0);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showItem9Crisis, setShowItem9Crisis] = useState<boolean>(false);
  const [completedResult, setCompletedResult] = useState<{
    total: number;
    severity: string;
    item9Flag: boolean;
    disclaimer: string;
  } | null>(null);

  const { data: dbHistory, isError: historyFailed, refetch: refetchHistory } = useAssessments();
  const submitMutation = useSubmitAssessment();
  const { t: tc } = useTranslation(CONTENT_NS);
  // Whether the finished screening really reached the backend. "preview" = offline preview, never saved.
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed" | "preview">("idle");
  const [pending, setPending] = useState<{ instrument: AssessmentInstrument; answers: number[] } | null>(null);

  // The preview starts empty too: no invented past screenings, ever.
  const [demoHistory, setDemoHistory] = useState<AssessmentItem[]>([]);

  const isDemo = isDemoModeActive();
  const history = isDemo ? demoHistory : (dbHistory ?? []);

  /** Sends the answers to the backend and records, truthfully, whether it was confirmed. */
  const persist = async (inst: AssessmentInstrument, finalAnswers: number[]) => {
    setPending({ instrument: inst, answers: finalAnswers });
    setSaveState("saving");
    try {
      await submitMutation.mutateAsync({ instrument: inst, answers: finalAnswers });
      setSaveState("saved");
      setPending(null);
    } catch {
      setSaveState("failed");
    }
  };

  const currentQuestions =
    instrument === "phq9" ? PHQ9_QUESTIONS : instrument === "gad7" ? GAD7_QUESTIONS : PHQ4_QUESTIONS;

  const currentDisclaimer =
    instrument === "phq9" ? PHQ9_DISCLAIMER : instrument === "gad7" ? GAD7_DISCLAIMER : PHQ4_DISCLAIMER;

  const handleSelectInstrument = (inst: AssessmentInstrument) => {
    setInstrument(inst);
    setStep(0);
    setAnswers([]);
    setCompletedResult(null);
    setShowItem9Crisis(false);
    setSaveState("idle");
    setPending(null);
  };

  const handleAnswer = (score: number) => {
    const nextAnswers = [...answers, score];
    setAnswers(nextAnswers);

    // CRITICAL SAFETY RULE: Any non-zero on PHQ-9 item 9 (index 8) IMMEDIATELY triggers crisis protocol!
    if (instrument === "phq9" && step === 8 && score > 0) {
      setShowItem9Crisis(true);
    }

    if (step + 1 < currentQuestions.length) {
      setStep(step + 1);
    } else {
      // Completed all questions
      const scored = scoreAssessmentLocally(instrument, nextAnswers);
      setCompletedResult({
        total: scored.total,
        severity: scored.severity,
        item9Flag: scored.item9_flag,
        disclaimer: scored.disclaimer,
      });

      if (scored.item9_flag) {
        setShowItem9Crisis(true);
      }

      // Persist to backend or demo store
      if (!isDemo) {
        void persist(instrument, nextAnswers);
      } else {
        setSaveState("preview");
        const newHistItem: AssessmentItem = {
          id: `demo-eval-${Date.now()}`,
          instrument,
          answers: nextAnswers,
          total: scored.total,
          severity: scored.severity,
          item9_flag: scored.item9_flag,
          disclaimer: scored.disclaimer,
          crisis: scored.crisis,
          completed_at: new Date().toISOString(),
        };
        setDemoHistory((prev) => [newHistItem, ...prev]);
      }
    }
  };

  const handleRetake = () => {
    setStep(0);
    setAnswers([]);
    setCompletedResult(null);
    setShowItem9Crisis(false);
    setSaveState("idle");
    setPending(null);
  };

  // 1. CRITICAL ITEM-9 CRISIS PROTOCOL CARD (shown before normal result)
  if (showItem9Crisis) {
    return (
      <div className="focus-page" role="alert" aria-live="assertive">
        <section
          className="result-card"
          style={{
            borderColor: "var(--danger)",
            background: "color-mix(in oklch, var(--danger) 8%, var(--white))",
          }}
        >
          <span className="result-ring red">
            <Icon name="phone" size={42} />
          </span>

          <span className="eyebrow" style={{ color: "var(--danger)", fontWeight: 800 }}>
            CRITICAL SAFETY PROTOCOL ACTIVATED
          </span>

          <h1 style={{ color: "var(--danger)", margin: "12px 0" }}>
            You are not alone. Immediate support is here for you.
          </h1>

          <p style={{ fontSize: 16, lineHeight: 1.6, maxWidth: 640, margin: "0 auto 20px" }}>
            Your response to <strong>Item 9</strong> indicates thoughts of self-harm or being better off
            dead. MindSahaay has prioritized your immediate safety over routine assessment scoring. Free,
            compassionate, and strictly confidential professional support is available right now across India.
          </p>

          {/* Helpline Call Cards */}
          <div className="sos-hotline-list" style={{ maxWidth: 600, margin: "0 auto 24px" }}>
            <div className="sos-item" style={{ background: "var(--white)", borderColor: "var(--danger)" }}>
              <div>
                <strong style={{ fontSize: 16 }}>Tele-MANAS (Govt. of India)</strong>
                <p>24/7 National Tele Mental Health · Free in 20+ Languages</p>
              </div>
              <a href="tel:14416" className="sos-call-btn" aria-label="Call Tele-MANAS 14416">
                <Icon name="phone" size={15} /> Dial 14416
              </a>
            </div>

            <div className="sos-item" style={{ background: "var(--white)", borderColor: "var(--danger)" }}>
              <div>
                <strong style={{ fontSize: 16 }}>KIRAN Mental Health Helpline</strong>
                <p>Ministry of Social Justice & Empowerment · 24/7 Toll-Free</p>
              </div>
              <a href="tel:18005990019" className="sos-call-btn" aria-label="Call KIRAN Helpline 1800-599-0019">
                <Icon name="phone" size={15} /> 1800-599-0019
              </a>
            </div>

            <div className="sos-item" style={{ background: "var(--white)", borderColor: "var(--danger)" }}>
              <div>
                <strong style={{ fontSize: 16 }}>National Emergency Services</strong>
                <p>Immediate police, medical, or campus dispatch</p>
              </div>
              <a
                href="tel:112"
                className="sos-call-btn"
                style={{ background: "#111c18", color: "#ffffff" }}
                aria-label="Dial Emergency 112"
              >
                <Icon name="phone" size={15} /> Dial 112
              </a>
            </div>
          </div>

          <div className="result-actions" style={{ justifyContent: "center", gap: 12 }}>
            <button
              type="button"
              className="primary-btn pulse-accent"
              onClick={openSafetyPlan || (() => { window.location.href = "/crisis"; })}
            >
              <Icon name="shield" size={18} /> Open My Crisis Safety Plan
            </button>

            {goDoctors && (
              <button type="button" className="outline-btn" onClick={goDoctors}>
                Connect With Campus Counsellor
              </button>
            )}

            <button
              type="button"
              className="outline-btn"
              onClick={() => setShowItem9Crisis(false)}
              style={{ color: "var(--muted)" }}
            >
              Continue to assessment summary
            </button>
          </div>

          <div
            className="privacy-note"
            style={{
              marginTop: 24,
              textAlign: "left",
              background: "var(--white)",
              border: "1px solid var(--line)",
            }}
          >
            <Icon name="shield" size={18} />
            <small>
              MindSahaay operates under the Mental Healthcare Act 2017. Your responses are not reported to
              parents or university administration.
            </small>
          </div>
        </section>
      </div>
    );
  }

  // 2. COMPLETED ASSESSMENT RESULTS SCREEN
  if (completedResult) {
    const { total, severity, disclaimer } = completedResult;
    const isModerateOrHigher =
      severity === "moderate" || severity === "moderately severe" || severity === "severe";

    return (
      <div className="focus-page">
        <section className="result-card">
          <span className={`result-ring ${isModerateOrHigher ? "orange" : "green"}`}>
            <Icon name={isModerateOrHigher ? "heart" : "check"} size={42} />
          </span>

          <span className="eyebrow green">
            SCREENING COMPLETE · {instrument.toUpperCase()} INSTRUMENT
          </span>

          <h1 style={{ margin: "14px 0 10px" }}>
            Score Band: {severity.charAt(0).toUpperCase() + severity.slice(1)} ({total} points)
          </h1>

          <p style={{ maxWidth: 600, margin: "0 auto 20px", lineHeight: 1.6 }}>
            {severity === "minimal" || severity === "normal"
              ? "Your responses suggest that your symptoms are currently within a manageable, minimal range. Continuing your supportive routines and sleep habits is encouraged."
              : severity === "mild"
              ? "Your responses indicate mild symptoms. Gentle daily adjustments, consistent sleep, physical activity, and guided relaxation exercises can help restore balance."
              : "Your responses suggest moderate or significant signs of distress. You do not have to navigate this alone—connecting with a campus counsellor can provide supportive strategies."}
          </p>

          <div className="profile-facts" style={{ margin: "18px auto 24px", maxWidth: 480 }}>
            <span>
              <strong>{total}</strong>Total Score
            </span>
            <span>
              <strong>{severity.toUpperCase()}</strong>Severity Band
            </span>
            <span>
              <strong>{instrument.toUpperCase()}</strong>Standard Scale
            </span>
          </div>

          <div className="result-actions" style={{ justifyContent: "center", gap: 12 }}>
            <button type="button" className="primary-btn" onClick={handleRetake}>
              Retake Check-in
            </button>

            {openCarePlan && (
              <button type="button" className="outline-btn" onClick={openCarePlan}>
                View Care Plan
              </button>
            )}

            {isModerateOrHigher && goDoctors && (
              <button type="button" className="primary-btn pulse-accent" onClick={goDoctors}>
                Book Campus Counsellor <Icon name="arrow" size={17} />
              </button>
            )}
          </div>

          <div role="status" aria-live="polite" data-testid="assessment-save-status" style={{ marginTop: 18, fontSize: 13 }}>
            {saveState === "saving" && <span className="muted">{tc("assessmentSave.saving")}</span>}
            {saveState === "saved" && <span className="saved-label">{"\u2713 "}{tc("assessmentSave.saved")}</span>}
            {saveState === "preview" && <span className="muted">{tc("assessmentSave.preview")}</span>}
          </div>
          {saveState === "failed" && (
            <div role="alert" data-testid="assessment-save-failed" style={{ marginTop: 12, color: "var(--danger)", fontWeight: 600 }}>
              <p>{tc("assessmentSave.failed")}</p>
              {pending && (
                <button
                  type="button"
                  className="primary-btn"
                  style={{ marginTop: 8 }}
                  onClick={() => void persist(pending.instrument, pending.answers)}
                >
                  {tc("assessmentSave.retry")}
                </button>
              )}
            </div>
          )}

          <div
            style={{
              marginTop: 28,
              padding: "16px",
              background: "var(--canvas)",
              borderRadius: 10,
              border: "1px solid var(--line)",
              fontSize: 12,
              lineHeight: 1.5,
              color: "var(--muted)",
              textAlign: "left",
            }}
          >
            <strong>Educational Disclaimer:</strong> {disclaimer}
          </div>
        </section>
      </div>
    );
  }

  // 3. QUESTION-BY-QUESTION SCREENING FLOW
  return (
    <div className="focus-page">
      {/* Instrument Switcher Tabs */}
      <div
        className="segment"
        style={{ marginBottom: 24, alignSelf: "center" }}
        role="group"
        aria-label="Select mental health assessment instrument"
      >
        <button
          type="button"
          className={instrument === "phq9" ? "active" : ""}
          onClick={() => handleSelectInstrument("phq9")}
          aria-pressed={instrument === "phq9"}
        >
          PHQ-9 Depression (9 Questions)
        </button>
        <button
          type="button"
          className={instrument === "gad7" ? "active" : ""}
          onClick={() => handleSelectInstrument("gad7")}
          aria-pressed={instrument === "gad7"}
        >
          GAD-7 Anxiety (7 Questions)
        </button>
        <button
          type="button"
          className={instrument === "phq4" ? "active" : ""}
          onClick={() => handleSelectInstrument("phq4")}
          aria-pressed={instrument === "phq4"}
        >
          PHQ-4 Brief (4 Questions)
        </button>
      </div>

      <section className="test-card" aria-label={`${instrument.toUpperCase()} questionnaire`}>
        <div className="test-progress">
          <span>
            Question {step + 1} of {currentQuestions.length}
          </span>
          <span>{Math.round(((step + 1) / currentQuestions.length) * 100)}% complete</span>
        </div>

        <div className="progress">
          <i style={{ width: `${((step + 1) / currentQuestions.length) * 100}%` }} />
        </div>

        <span className="soft-icon mint large" style={{ marginTop: 16 }}>
          <Icon name="heart" />
        </span>

        <span className="eyebrow green">{currentQuestions[step].sub}</span>

        <h1 style={{ fontSize: "clamp(20px, 3vw, 28px)", margin: "14px 0" }}>
          Over the last 2 weeks, how often have you been bothered by:
          <br />
          <em style={{ fontStyle: "normal", color: "var(--primary-dark)" }}>
            "{currentQuestions[step].text}"
          </em>
        </h1>

        <p className="muted" style={{ marginBottom: 20 }}>
          Choose the response that best reflects your recent experience. There are no right or wrong answers.
        </p>

        {/* 4 Standard Options */}
        <div className="answer-grid">
          {ANSWER_OPTIONS.map((opt) => (
            <button
              type="button"
              key={opt.score}
              onClick={() => handleAnswer(opt.score)}
              aria-label={`${opt.label} (${opt.score} points)`}
            >
              <span>{opt.score}</span>
              {opt.label}
              <Icon name="arrow" size={18} />
            </button>
          ))}
        </div>

        <div className="test-nav-row" style={{ marginTop: 24 }}>
          {step > 0 && (
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setStep(step - 1);
                setAnswers((prev) => prev.slice(0, -1));
              }}
            >
              ← Previous question
            </button>
          )}

          <div className="privacy-inline">
            <Icon name="shield" size={16} /> Responses are encrypted & stored confidentially.
          </div>
        </div>

        {/* Mandatory Educational Disclaimer */}
        <p
          className="muted"
          style={{
            marginTop: 20,
            fontSize: 12,
            borderTop: "1px solid var(--line)",
            paddingTop: 14,
            lineHeight: 1.5,
          }}
        >
          {currentDisclaimer}
        </p>
      </section>

      {/* Historical Assessment Trends */}
      {!isDemo && historyFailed && (
        <div role="alert" className="panel" style={{ marginTop: 32, maxWidth: 740, width: "100%" }}>
          <p style={{ color: "var(--danger)", fontWeight: 600 }}>{tc("assessmentSave.historyError")}</p>
          <button type="button" className="primary-btn" style={{ marginTop: 8 }} onClick={() => void refetchHistory()}>
            {tc("common.retry")}
          </button>
        </div>
      )}
      {history.length > 0 && (
        <section className="panel" style={{ marginTop: 32, maxWidth: 740, width: "100%" }}>
          <div className="panel-head">
            <div>
              <h3>Your Past Screenings</h3>
              <p className="muted">Confidential score trend across completed assessments.</p>
            </div>
          </div>

          <div className="care-plan-list">
            {history.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="care-step"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <div>
                  <strong>
                    {item.instrument.toUpperCase()} · Score {item.total} (
                    {item.severity.charAt(0).toUpperCase() + item.severity.slice(1)})
                  </strong>
                  <p className="muted" style={{ fontSize: 12 }}>
                    Completed on {new Date(item.completed_at || item.created_at || Date.now()).toLocaleDateString()}
                  </p>
                </div>
                <span className={`tag ${item.crisis ? "mild" : "calm"}`} style={{ fontSize: 11 }}>
                  {item.crisis ? "Crisis Flagged" : item.severity}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
