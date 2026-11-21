import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { registerBundle } from "../journal/registerBundle";

/** Merges the follow-up strings into the global i18next instance (i18n.addResourceBundle under the content namespace). */
registerBundle(en, hi);