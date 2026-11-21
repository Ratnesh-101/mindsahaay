import React, { useEffect } from "react";
import { BrowserRouter } from "react-router";
import QueryProvider from "./app/providers/QueryProvider";
import I18nProvider from "./app/providers/I18nProvider";
import AuthProvider from "./app/providers/AuthProvider";
import ErrorBoundary from "./app/ErrorBoundary";
import AppRoutes from "./app/routes";
import { EnhancedAudioEngine, enhancedAudio, type SoundscapeType } from "./audio/EnhancedAudioEngine";

export { EnhancedAudioEngine, enhancedAudio, type SoundscapeType };

export default function App() {
  useEffect(() => {
    document.documentElement.lang = "en";
    document.title = "MindSahaay | Student Wellbeing";
  }, []);

  return (
    <ErrorBoundary>
      <QueryProvider>
        <I18nProvider>
          <AuthProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </AuthProvider>
        </I18nProvider>
      </QueryProvider>
    </ErrorBoundary>
  );
}
