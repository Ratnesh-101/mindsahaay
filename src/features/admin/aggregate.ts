import type { Analytics } from "./api";

/** True when a group is too small to show (k-anonymity). A missing or invalid size is treated as too small. */
export function isSuppressed(size: number | null | undefined, k: number): boolean {
  return typeof size !== "number" || !Number.isFinite(size) || size < k;
}

export interface MatrixCell {
  /** Group size, or null when the group is hidden. */
  size: number | null;
  /** Secondary value (for example a mean), or null when hidden. */
  value: number | null;
}

export interface Matrix {
  rows: string[];
  cols: string[];
  /** cells[row][col]; undefined means the group is not published (suppressed). */
  cells: Record<string, Record<string, MatrixCell | undefined>>;
}

function build(entries: { row: string; col: string; size: number; value: number | null }[], k: number): Matrix {
  const rows = Array.from(new Set(entries.map((e) => e.row))).sort();
  const cols = Array.from(new Set(entries.map((e) => e.col))).sort();
  const cells: Matrix["cells"] = {};
  for (const r of rows) cells[r] = {};
  for (const e of entries) {
    if (isSuppressed(e.size, k)) continue; // defensive: never keep a small group, even if the API sent one
    cells[e.row][e.col] = { size: e.size, value: e.value };
  }
  return { rows, cols, cells };
}

/** Severity band x month for one instrument. Small groups are dropped. */
export function assessmentMatrix(a: Analytics, instrument: string, k: number): Matrix {
  return build(
    a.assessmentAggregates
      .filter((r) => r.instrument === instrument)
      .map((r) => ({ row: r.severity, col: r.report_month, size: r.sample_size, value: r.mean_score ?? null })),
    k,
  );
}

/** Mood x week. Small groups are dropped. */
export function moodMatrix(a: Analytics, k: number): Matrix {
  return build(
    a.moodAggregates.map((r) => ({ row: r.mood, col: r.report_week, size: r.sample_size, value: r.avg_intensity ?? null })),
    k,
  );
}

/** Severity level x month, using incident_count as the group size. */
export function riskMatrix(a: Analytics, k: number): Matrix {
  return build(
    a.riskAggregates.map((r) => ({ row: r.severity_level, col: r.report_month, size: r.incident_count, value: null })),
    k,
  );
}

/** Weighted mean of published cells per column (month or week). Hidden cells do not contribute. */
export function weightedMeanByColumn(m: Matrix): { col: string; value: number }[] {
  const out: { col: string; value: number }[] = [];
  for (const col of m.cols) {
    let total = 0;
    let weight = 0;
    for (const row of m.rows) {
      const cell = m.cells[row][col];
      if (cell && cell.size !== null && cell.value !== null) {
        total += cell.value * cell.size;
        weight += cell.size;
      }
    }
    if (weight > 0) out.push({ col, value: Math.round((total / weight) * 100) / 100 });
  }
  return out;
}

/** Weighted mean of published cells per row (for example per mood). */
export function weightedMeanByRow(m: Matrix): { row: string; value: number }[] {
  const out: { row: string; value: number }[] = [];
  for (const row of m.rows) {
    let total = 0;
    let weight = 0;
    for (const col of m.cols) {
      const cell = m.cells[row][col];
      if (cell && cell.size !== null && cell.value !== null) {
        total += cell.value * cell.size;
        weight += cell.size;
      }
    }
    if (weight > 0) out.push({ row, value: Math.round((total / weight) * 100) / 100 });
  }
  return out;
}

/** Sum of published sizes per column. */
export function totalsByColumn(m: Matrix): { col: string; value: number }[] {
  return m.cols
    .map((col) => ({
      col,
      value: m.rows.reduce((sum, row) => sum + (m.cells[row][col]?.size ?? 0), 0),
    }))
    .filter((x) => x.value > 0);
}
