import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../../shared/lib/supabase";
import { clearAllLocalUserData } from "../../shared/lib/storage/secureStore";

export type UserRole =
  | "student"
  | "counsellor"
  | "moderator"
  | "institution_admin"
  | "super_admin";

export interface UserProfile {
  id: string;
  role: UserRole;
  alias: string;
  locale: string;
  institution_id?: string | null;
  avatar_seed?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  error: Error | null;
  signInWithEmail: (email: string, redirectTo?: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: (redirectTo?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<{ error: Error | null }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

/** True when a persisted Supabase session or an auth redirect (magic link, OAuth code) may exist. */
function hasSessionToRestore(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const storage = window.localStorage;
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) return true;
    }
  } catch {
    return true;
  }
  const { search, hash } = window.location;
  return /(^|[?&#])(access_token|refresh_token|code|token_hash|error|error_description)=/.test(
    `${search}${hash}`,
  );
}

function scheduleIdle(callback: () => void): () => void {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 0);
  return () => clearTimeout(id);
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export default function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchProfile = useCallback(async (activeUser: User): Promise<UserProfile | null> => {
    try {
      const { data, error: profileErr } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", activeUser.id)
        .maybeSingle();

      if (profileErr) {
        // If profile table doesn't have the record yet, construct from metadata
        const fallback: UserProfile = {
          id: activeUser.id,
          role: (activeUser.user_metadata?.role as UserRole) || "student",
          alias:
            activeUser.user_metadata?.alias ||
            activeUser.user_metadata?.name ||
            activeUser.email?.split("@")[0] ||
            "Student",
          locale: activeUser.user_metadata?.locale || "en",
        };
        return fallback;
      }

      if (data) {
        return data as UserProfile;
      }

      const fallback: UserProfile = {
        id: activeUser.id,
        role: (activeUser.user_metadata?.role as UserRole) || "student",
        alias:
          activeUser.user_metadata?.alias ||
          activeUser.user_metadata?.name ||
          activeUser.email?.split("@")[0] ||
          "Student",
        locale: "en",
      };
      return fallback;
    } catch {
      const fallback: UserProfile = {
        id: activeUser.id,
        role: "student",
        alias: activeUser.email?.split("@")[0] || "Student",
        locale: "en",
      };
      return fallback;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) {
      setProfile(null);
      return;
    }
    const prof = await fetchProfile(user);
    setProfile(prof);
  }, [user, fetchProfile]);

  useEffect(() => {
    let isMounted = true;

    // The student identity ALWAYS comes from the active Supabase session
    async function initAuth() {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          if (isMounted) setError(sessionError);
        }

        const currentSession = sessionData.session;
        if (isMounted) {
          setSession(currentSession);
          setUser(currentSession?.user ?? null);
        }

        if (currentSession?.user) {
          const prof = await fetchProfile(currentSession.user);
          if (isMounted) setProfile(prof);
        } else {
          if (isMounted) setProfile(null);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error("Failed to initialize session"));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    let subscription: { unsubscribe: () => void } | null = null;

    function start() {
      if (!isMounted) return;
      initAuth();
      const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        setUser(newSession?.user ?? null);

        if (newSession?.user) {
          const prof = await fetchProfile(newSession.user);
          if (isMounted) setProfile(prof);
        } else {
          if (isMounted) setProfile(null);
        }
        setLoading(false);
      });
      subscription = listener.subscription;
    }

    // The Supabase SDK is loaded lazily. When there is nothing to restore (no stored session and no
    // auth redirect params in the URL) the first paint does not wait for it: loading ends at once and
    // the session check runs when the browser is idle. Otherwise it starts immediately.
    let cancelScheduled = () => {};
    if (hasSessionToRestore()) {
      start();
    } else {
      setLoading(false);
      cancelScheduled = scheduleIdle(start);
    }

    return () => {
      isMounted = false;
      cancelScheduled();
      subscription?.unsubscribe();
    };
  }, [fetchProfile]);

  const signInWithEmail = useCallback(
    async (email: string, redirectTo?: string): Promise<{ error: Error | null }> => {
      try {
        setError(null);
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo:
              redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
          },
        });
        if (otpError) {
          setError(otpError);
          return { error: otpError };
        }
        return { error: null };
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error("Sign in with email failed");
        setError(errObj);
        return { error: errObj };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (redirectTo?: string): Promise<{ error: Error | null }> => {
      try {
        setError(null);
        const { error: oauthError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo:
              redirectTo || (typeof window !== "undefined" ? window.location.origin : undefined),
          },
        });
        if (oauthError) {
          setError(oauthError);
          return { error: oauthError };
        }
        return { error: null };
      } catch (err) {
        const errObj = err instanceof Error ? err : new Error("Sign in with Google failed");
        setError(errObj);
        return { error: errObj };
      }
    },
    [],
  );

  const signOut = useCallback(async (): Promise<{ error: Error | null }> => {
    try {
      setError(null);
      // Central cleanup of user local storage, session storage, and in-memory vault
      clearAllLocalUserData();
      const { error: signoutError } = await supabase.auth.signOut();
      setSession(null);
      setUser(null);
      setProfile(null);
      if (signoutError) {
        setError(signoutError);
        return { error: signoutError };
      }
      return { error: null };
    } catch (err) {
      const errObj = err instanceof Error ? err : new Error("Sign out failed");
      setError(errObj);
      return { error: errObj };
    }
  }, []);

  const role = profile?.role ?? null;

  const value: AuthContextValue = {
    user,
    session,
    profile,
    role,
    loading,
    error,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
