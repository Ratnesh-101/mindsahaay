import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import VaultGate from "../journal/VaultGate";
import { errorClass, hintClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import { fetchCaseload, fetchTrajectory, type CaseloadEntry, type ScorePoint } from "./api";
import RiskQueue from "./RiskQueue";
import SessionNotes from "./SessionNotes";
import TrajectoryChart from "./TrajectoryChart";

type Load = "loading" | "ready" | "error";

/** Counsellor dashboard: consented caseload, PHQ-9/GAD-7 trajectories, live risk queue, encrypted notes. */
export default function CounsellorDashboard() {
  const { t } = useTranslation(CONTENT_NS);
  const [caseload, setCaseload] = useState<CaseloadEntry[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [selected, setSelected] = useState<CaseloadEntry | null>(null);
  const [points, setPoints] = useState<ScorePoint[]>([]);
  const [trajectoryError, setTrajectoryError] = useState(false);
  const [trajectoryLoaded, setTrajectoryLoaded] = useState(false);

  const refresh = useCallback(async () => {
    setLoad("loading");
    try {
      setCaseload(await fetchCaseload());
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const nameFor = useCallback(
    (studentId: string) => {
      const entry = caseload.find((c) => c.studentId === studentId);
      return entry?.alias || t("counsellor.studentFallback", { code: studentId.slice(0, 4).toUpperCase() });
    },
    [caseload, t],
  );

  const open = async (entry: CaseloadEntry) => {
    setSelected(entry);
    setPoints([]);
    setTrajectoryError(false);
    setTrajectoryLoaded(false);
    try {
      setPoints(await fetchTrajectory(entry.studentId));
    } catch {
      setTrajectoryError(true);
    } finally {
      setTrajectoryLoaded(true);
    }
  };

  return (
    <div className="page">
      <div className="directory-head">
        <div>
          <h1>{t("counsellor.title")}</h1>
          <p>{t("counsellor.subtitle")}</p>
        </div>
      </div>

      <aside
        role="note"
        aria-labelledby="audit-title"
        className="mb-4 flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--primary-soft)] p-3 text-sm"
        data-testid="audit-notice"
      >
        <Icon name="shield" size={18} />
        <div>
          <strong id="audit-title">{t("counsellor.auditTitle")}</strong>
          <p>{t("counsellor.auditNotice")}</p>
        </div>
      </aside>

      {load === "loading" && (
        <p role="status" className="muted">
          {t("counsellor.loading")}
        </p>
      )}
      {load === "error" && (
        <div role="alert" className={errorClass}>
          <p>{t("counsellor.loadError")}</p>
          <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void refresh()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {load === "ready" && (
        <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-6">
            <section className="panel" aria-labelledby="caseload-title">
              <h2 id="caseload-title" className="text-lg font-bold">
                {t("counsellor.caseloadTitle", { count: caseload.length })}
              </h2>
              {caseload.length === 0 && <p className="muted mt-2">{t("counsellor.caseloadEmpty")}</p>}
              <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">
                {caseload.map((c) => {
                  const name = nameFor(c.studentId);
                  const isSelected = selected?.studentId === c.studentId;
                  return (
                    <li key={c.careShareId}>
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={t("counsellor.select", { name })}
                        onClick={() => void open(c)}
                        className={`w-full min-h-11 rounded-xl border p-3 text-left ${
                          isSelected ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--line)]"
                        }`}
                      >
                        <strong>{name}</strong>
                        <span className={`block ${hintClass}`}>{t("counsellor.scope", { scope: c.scope.join(", ") })}</span>
                        {c.expiresAt && (
                          <span className={`block ${hintClass}`}>
                            {t("counsellor.expires", { date: new Date(c.expiresAt).toLocaleDateString() })}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
            <RiskQueue nameFor={nameFor} />
          </div>

          <section className="panel" aria-labelledby="detail-title" aria-live="polite">
            {selected ? (
              <>
                <h2 id="detail-title" className="text-lg font-bold">
                  {t("counsellor.selected", { name: nameFor(selected.studentId) })}
                </h2>
                <h3 className="mt-3 font-bold">{t("counsellor.trajectoryTitle")}</h3>
                <p className={hintClass}>{t("counsellor.trajectoryIntro")}</p>
                {trajectoryError && (
                  <p role="alert" className={`${errorClass} mt-2`}>
                    {t("counsellor.trajectoryError")}
                  </p>
                )}
                {trajectoryLoaded && !trajectoryError && points.length === 0 && <p className="muted mt-2">{t("counsellor.noAssessments")}</p>}
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <TrajectoryChart instrument="phq9" points={points} />
                  <TrajectoryChart instrument="gad7" points={points} />
                </div>
                <div className="mt-5">
                  <VaultGate>
                    <SessionNotes studentId={selected.studentId} />
                  </VaultGate>
                </div>
              </>
            ) : (
              <h2 id="detail-title" className="text-lg font-bold text-[var(--muted)]">
                {t("counsellor.trajectoryTitle")}
              </h2>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
