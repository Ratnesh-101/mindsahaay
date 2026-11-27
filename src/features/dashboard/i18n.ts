import i18n from "i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

/** Own i18next namespace so feature keys never collide with src/locales. */
export const DASHBOARD_NS = "dashboard";

function apply(): void {
  i18n.addResourceBundle("en", DASHBOARD_NS, en, true, false);
  i18n.addResourceBundle("hi", DASHBOARD_NS, hi, true, false);
}

/** Registers the feature-local translation bundle. Safe to call more than once. */
export function registerDashboardBundle(): void {
  if (i18n.isInitialized) {
    apply();
  } else {
    i18n.on("initialized", apply);
  }
}

registerDashboardBundle();
