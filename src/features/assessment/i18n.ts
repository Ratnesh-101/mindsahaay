import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { registerBundle } from "../journal/registerBundle";

/** Merges the screening save-status strings into the global i18next instance (content namespace). */
registerBundle(en, hi);
