import React, { useEffect, useState } from "react";
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import enTranslations from "../../locales/en.json";

export const defaultNS = "translation";
export const resources = {
  en: { translation: enTranslations },
} as const;

if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources,
    lng: "en",
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
  });
}

// Only the active language (English) is bundled into the entry. The Hindi catalogue is a separate
// chunk that loads the first time the UI switches to it, before the switch is applied.
const LAZY_LOCALES: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  hi: () => import("../../locales/hi.json"),
};

const WRAPPED = Symbol.for("mindsahaay.i18n.lazyLocales");
const patchable = i18n as typeof i18n & { [WRAPPED]?: boolean };
if (!patchable[WRAPPED]) {
  patchable[WRAPPED] = true;
  const originalChangeLanguage = i18n.changeLanguage.bind(i18n);
  i18n.changeLanguage = (lng?: string, callback?: Parameters<typeof originalChangeLanguage>[1]) => {
    const base = lng?.split("-")[0];
    const loader = base ? LAZY_LOCALES[base] : undefined;
    // The switch itself stays synchronous so callers and tests see the new language immediately.
    // Until the chunk arrives, keys fall back to English.
    const result = originalChangeLanguage(lng, callback);
    if (base && loader && !i18n.hasResourceBundle(base, defaultNS)) {
      loader()
        .then((bundle) => {
          i18n.addResourceBundle(base, defaultNS, bundle.default, true, false);
          // Re-render subscribers (useTranslation listens to languageChanged).
          if (i18n.language?.split("-")[0] === base) i18n.emit("languageChanged", i18n.language);
        })
        .catch(() => {
          // Offline or chunk failure: stay on the English fallback.
        });
    }
    return result;
  };
}

export { i18n };

interface I18nProviderProps {
  children: React.ReactNode;
}

export default function I18nProvider({ children }: I18nProviderProps) {
  const [isReady, setIsReady] = useState<boolean>(i18n.isInitialized);

  useEffect(() => {
    if (!i18n.isInitialized) {
      const onInit = () => setIsReady(true);
      i18n.on("initialized", onInit);
      return () => {
        i18n.off("initialized", onInit);
      };
    } else {
      setIsReady(true);
    }
  }, []);

  if (!isReady) {
    return <>{children}</>;
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
