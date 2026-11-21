import i18n from "i18next";
import en from "./en.json";
import hi from "./hi.json";

/** Own i18next namespace so these keys can never collide with src/locales. */
export const OFFLINE_UI_NS = "offlineUi";

function apply() {
  i18n.addResourceBundle("en", OFFLINE_UI_NS, en, true, false);
  i18n.addResourceBundle("hi", OFFLINE_UI_NS, hi, true, false);
}

/** Registers the feature-local bundles. Safe to call more than once. */
export function registerOfflineUiBundle(): void {
  if (i18n.isInitialized) {
    apply();
  } else {
    i18n.on("initialized", apply);
  }
}

registerOfflineUiBundle();

/** Formats the helplines verification date (ISO yyyy-mm-dd) for the active UI language. */
export function formatVerifiedDate(iso: string, language: string): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const locale = language?.startsWith("hi") ? "hi-IN" : "en-IN";
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}
