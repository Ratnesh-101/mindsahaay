import i18n from "i18next";

/** Own i18next namespace so feature keys can never collide with src/locales. Use useTranslation(CONTENT_NS). */
export const CONTENT_NS = "content";

type Bundle = Record<string, unknown>;

/** Strings shared by every content feature. Merged together with each feature bundle. */
const COMMON_EN = {
  common: {
    call: "Call {{name}} on {{number}}",
    callShort: "Call",
    close: "Close",
    loading: "Loading...",
    retry: "Try again",
    tollFree: "toll-free {{number}}",
    available247: "24/7, free and confidential",
  },
};

const COMMON_HI = {
  common: {
    call: "{{name}} को {{number}} पर कॉल करें",
    callShort: "कॉल करें",
    close: "बंद करें",
    loading: "लोड हो रहा है...",
    retry: "फिर कोशिश करें",
    tollFree: "टोल-फ़्री {{number}}",
    available247: "24/7, निःशुल्क और गोपनीय",
  },
};

/**
 * Merges a feature-local translation bundle (plus the shared "common" strings) into the global
 * i18next instance. If i18next has not finished initialising yet, the merge is deferred until the
 * "initialized" event so that the init() call cannot overwrite it.
 * The shared src/locales files are never edited.
 */
export function registerBundle(en: Bundle, hi: Bundle): void {
  const apply = () => {
    i18n.addResourceBundle("en", CONTENT_NS, COMMON_EN, true, false);
    i18n.addResourceBundle("hi", CONTENT_NS, COMMON_HI, true, false);
    i18n.addResourceBundle("en", CONTENT_NS, en, true, false);
    i18n.addResourceBundle("hi", CONTENT_NS, hi, true, false);
  };
  if (i18n.isInitialized) {
    apply();
  } else {
    i18n.on("initialized", apply);
  }
}