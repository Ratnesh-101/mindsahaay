import React from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { MANDATORY_HELPLINES } from "../../domain/risk/riskRouting";

/** One-tap dial links for Tele-MANAS 14416, KIRAN 1800-599-0019 and emergency 112. */
export default function HelplineLinks() {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {MANDATORY_HELPLINES.map((line) => {
        const dial = line.number.replace(/[^0-9]/g, "");
        return (
          <li key={line.id}>
            <a
              href={`tel:${dial}`}
              className="primary-btn inline-flex min-h-11 flex-col justify-center no-underline"
              aria-label={t("common.call", { name: line.name, number: line.number })}
            >
              <span className="font-bold">{line.name}</span>
              <span className="text-[15px] font-bold">{line.number}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
