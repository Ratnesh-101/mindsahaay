import i18n from "i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

/** Own i18next namespace so feature keys can never collide with src/locales. */
export const INSIGHTS_NS = "insights";

function apply(): void {
  i18n.addResourceBundle("en", INSIGHTS_NS, en, true, false);
  i18n.addResourceBundle("hi", INSIGHTS_NS, hi, true, false);
}

/** Registers the feature-local translation bundle. Safe to call more than once. */
export function registerInsightsBundle(): void {
  if (i18n.isInitialized) {
    apply();
  } else {
    i18n.on("initialized", apply);
  }
}

registerInsightsBundle();
