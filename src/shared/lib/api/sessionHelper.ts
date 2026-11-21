import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { AuthRequiredError } from "./errors";

export async function getAuthenticatedSession(): Promise<{ session: Session; user: User }> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.user) {
    throw new AuthRequiredError(
      "Active session not found. Student identity must originate from a verified Supabase Auth session.",
    );
  }
  return { session: data.session, user: data.session.user };
}
