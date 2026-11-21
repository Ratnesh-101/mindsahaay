import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { registerBundle } from "./registerBundle";

/** Merges the journal and vault strings into the global i18next instance. */
registerBundle(en, hi);
