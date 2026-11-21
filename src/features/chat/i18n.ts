import en from "./locales/en.json";
import hi from "./locales/hi.json";
import { registerBundle } from "../journal/registerBundle";

/** Merges the chat and shared "common" strings into the global i18next instance. */
registerBundle(en, hi);
