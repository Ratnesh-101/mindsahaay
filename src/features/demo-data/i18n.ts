import i18n from "i18next";
import en from "./locales/en.json";
import hi from "./locales/hi.json";

/** Own i18next namespace so feature keys can never collide with src/locales. */
export const DEMO_DATA_NS = "demoData";

function apply(): void {
  i18n.addResourceBundle("en", DEMO_DATA_NS, en, true, false);
  i18n.addResourceBundle("hi", DEMO_DATA_NS, hi, true, false);
}

/** Registers the feature-local translation bundle. Safe to call more than once. */
export function registerDemoDataBundle(): void {
  if (i18n.isInitialized) {
    apply();
  } else {
    i18n.on("initialized", apply);
  }
}

registerDemoDataBundle();
