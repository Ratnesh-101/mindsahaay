import React from "react";
import { useTranslation } from "react-i18next";
import { DEMO_DATA_NS } from "./i18n";

/** Small "Demo" label shown on any row that is sample data (is_demo = true). */
export function DemoBadge({ count }: { count?: number } = {}) {
  const { t } = useTranslation(DEMO_DATA_NS);
  return (
    <span
      data-testid="demo-badge"
      style={{
        display: "inline-block",
        marginLeft: 6,
        padding: "1px 8px",
        borderRadius: 999,
        border: "1px solid var(--primary, #19443c)",
        color: "var(--primary, #19443c)",
        fontSize: 11,
        fontWeight: 700,
        lineHeight: 1.5,
        verticalAlign: "middle",
      }}
    >
      {count === undefined ? t("badge") : t("tagDemoCount", { n: count })}
    </span>
  );
}

/** One-line notice shown above lists that contain demo rows. */
export function DemoDataNotice() {
  const { t } = useTranslation(DEMO_DATA_NS);
  return (
    <p
      data-testid="demo-notice"
      role="note"
      className="muted"
      style={{ fontSize: 12, margin: "0 0 10px" }}
    >
      {t("includesNotice")}
    </p>
  );
}
