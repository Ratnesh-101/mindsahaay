import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass } from "../journal/ui";
import Icon from "../../shared/ui/Icon";
import { DEFAULT_K, fetchAnalytics, fetchMyInstitutionId, type Analytics } from "./api";
import {
  assessmentMatrix,
  moodMatrix,
  riskMatrix,
  totalsByColumn,
  weightedMeanByColumn,
  weightedMeanByRow,
  type Matrix,
} from "./aggregate";

interface AdminDashboardProps {
  /** Defaults to the signed-in admin's own institution. */
  institutionId?: string;
}

type State = "loading" | "ready" | "error" | "forbidden" | "none";

export default function AdminDashboard({ institutionId }: AdminDashboardProps) {
  const { t } = useTranslation(CONTENT_NS);
  const [state, setState] = useState<State>("loading");
  const [data, setData] = useState<Analytics | null>(null);
  const [instrument, setInstrument] = useState("phq9");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const id = institutionId ?? (await fetchMyInstitutionId());
      if (!id) {
        setState("none");
        return;
      }
      setData(await fetchAnalytics(id));
      setState("ready");
    } catch (err) {
      setState((err as { statusCode?: number }).statusCode === 403 ? "forbidden" : "error");
    }
  }, [institutionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const k = Math.max(DEFAULT_K, data?.kAnonymityThreshold ?? 0);
  const instruments = useMemo(() => Array.from(new Set((data?.assessmentAggregates ?? []).map((r) => r.instrument))).sort(), [data]);
  const activeInstrument = instruments.includes(instrument) ? instrument : (instruments[0] ?? instrument);

  const assessment = useMemo(() => (data ? assessmentMatrix(data, activeInstrument, k) : null), [data, activeInstrument, k]);
  const mood = useMemo(() => (data ? moodMatrix(data, k) : null), [data, k]);
  const risk = useMemo(() => (data ? riskMatrix(data, k) : null), [data, k]);

  const nothing =
    data !== null &&
    data.assessmentAggregates.length === 0 &&
    data.moodAggregates.length === 0 &&
    data.riskAggregates.length === 0;

  return (
    <div className="page">
      <div className="directory-head">
        <div>
          <h1>{t("admin.title")}</h1>
          <p>{t("admin.subtitle")}</p>
        </div>
      </div>

      <aside role="note" aria-labelledby="priv-title" className="mb-4 flex gap-3 rounded-xl border border-[var(--line)] bg-[var(--primary-soft)] p-3 text-sm">
        <Icon name="shield" size={18} />
        <div>
          <strong id="priv-title">{t("admin.privacyTitle")}</strong>
          <p>{t("admin.privacy", { k })}</p>
        </div>
      </aside>

      {state === "loading" && (
        <p role="status" className="muted">
          {t("admin.loading")}
        </p>
      )}
      {state === "forbidden" && (
        <p role="alert" className={errorClass}>
          {t("admin.forbidden")}
        </p>
      )}
      {state === "none" && (
        <p role="alert" className={errorClass}>
          {t("admin.noInstitution")}
        </p>
      )}
      {state === "error" && (
        <div role="alert" className={errorClass}>
          <p>{t("admin.loadError")}</p>
          <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void load()}>
            {t("common.retry")}
          </button>
        </div>
      )}

      {state === "ready" && nothing && <p className="muted">{t("admin.empty", { k })}</p>}

      {state === "ready" && data && !nothing && assessment && mood && risk && (
        <div className="flex flex-col gap-6">
          <section className="panel" aria-labelledby="adm-assess">
            <h2 id="adm-assess" className="text-lg font-bold">
              {t("admin.assessmentTitle")}
            </h2>
            <p className={hintClass}>{t("admin.assessmentNote")}</p>
            {instruments.length > 1 && (
              <div className="mt-2 max-w-xs">
                <label htmlFor="adm-instrument" className={labelClass}>
                  {t("admin.instrumentLabel")}
                </label>
                <select id="adm-instrument" className={fieldClass} value={activeInstrument} onChange={(e) => setInstrument(e.target.value)}>
                  {instruments.map((i) => (
                    <option key={i} value={i}>
                      {i.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <AggChart
              label={t("admin.chartAssessment", { name: activeInstrument.toUpperCase() })}
              data={weightedMeanByColumn(assessment).map((d) => ({ name: d.col, value: d.value }))}
            />
            <MatrixTable caption={t("admin.tableAssessment")} rowHeader={t("admin.band")} matrix={assessment} unit="students" k={k} />
          </section>

          <section className="panel" aria-labelledby="adm-mood">
            <h2 id="adm-mood" className="text-lg font-bold">
              {t("admin.moodTitle")}
            </h2>
            <AggChart label={t("admin.chartMood")} data={weightedMeanByRow(mood).map((d) => ({ name: d.row, value: d.value }))} />
            <MatrixTable caption={t("admin.tableMood")} rowHeader={t("admin.mood")} matrix={mood} unit="students" k={k} />
          </section>

          <section className="panel" aria-labelledby="adm-risk">
            <h2 id="adm-risk" className="text-lg font-bold">
              {t("admin.riskTitle")}
            </h2>
            <p className={hintClass}>{t("admin.riskNote", { k })}</p>
            <AggChart label={t("admin.chartRisk")} data={totalsByColumn(risk).map((d) => ({ name: d.col, value: d.value }))} />
            <MatrixTable caption={t("admin.tableRisk")} rowHeader={t("admin.band")} matrix={risk} unit="events" k={k} />
          </section>
        </div>
      )}
    </div>
  );
}

function AggChart({ label, data }: { label: string; data: { name: string; value: number }[] }) {
  const { t } = useTranslation(CONTENT_NS);
  if (data.length === 0) return null;
  return (
    <figure className="m-0 mt-3">
      <div style={{ width: "100%", height: 220 }} role="img" aria-label={label}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={32} />
            <Tooltip />
            <Bar dataKey="value" fill="var(--primary)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className={hintClass}>
        {label}. {t("admin.hiddenCellsNote")}
      </figcaption>
    </figure>
  );
}

function MatrixTable({ caption, rowHeader, matrix, unit, k }: { caption: string; rowHeader: string; matrix: Matrix; unit: "students" | "events"; k: number }) {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left text-[13px]">
        <caption className="mb-1 text-left font-semibold">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className="border-b border-[var(--line)] p-2">
              {rowHeader}
            </th>
            {matrix.cols.map((c) => (
              <th key={c} scope="col" className="border-b border-[var(--line)] p-2">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r}>
              <th scope="row" className="border-b border-[var(--line)] p-2 font-semibold">
                {r}
              </th>
              {matrix.cols.map((c) => {
                const cell = matrix.cells[r][c];
                return (
                  <td key={c} className="border-b border-[var(--line)] p-2">
                    {cell && cell.size !== null ? (
                      <span>
                        {unit === "students" ? t("admin.students", { count: cell.size }) : t("admin.events", { count: cell.size })}
                        {cell.value !== null && <span className={`block ${hintClass}`}>{cell.value}</span>}
                      </span>
                    ) : (
                      <span className="italic text-[var(--muted)]">{t("admin.suppressed", { k })}</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
