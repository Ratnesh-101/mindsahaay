import { adminSql, lit, EMAIL_PREFIX, EMAIL_DOMAIN, MAILPIT } from "./env";

const LIKE = `${EMAIL_PREFIX}%@${EMAIL_DOMAIN}`;

/**
 * Deletes users (and, through FK cascades, everything they own) whose email matches.
 * Several tables are append-only (risk_followups, risk_checkbacks, consents, audit_log) and
 * care_shares writes an audit row on delete, so their user triggers are switched off for the
 * duration of one transaction (local test DB only; FK actions stay active) and switched back on.
 */
function deleteUsersWhere(condition: string) {
  adminSql(`
    do $$
    declare ids uuid[]; t text;
    begin
      select array_agg(id) into ids from auth.users where ${condition};
      if ids is null then return; end if;
      foreach t in array array['risk_followups','risk_checkbacks','risk_checkback_prompts','consents','audit_log','care_shares'] loop
        execute format('alter table public.%I disable trigger user', t);
      end loop;
      delete from public.audit_log where actor_id = any(ids);
      delete from public.risk_followups where actor_id = any(ids)
        or risk_event_id in (select id from public.risk_events where student_id = any(ids));
      delete from auth.users where id = any(ids);
      foreach t in array array['risk_followups','risk_checkbacks','risk_checkback_prompts','consents','audit_log','care_shares'] loop
        execute format('alter table public.%I enable trigger user', t);
      end loop;
    end $$;
  `);
}
async function purgeMail(emails: string[] | null) {
  try {
    const q = emails ? emails.map((e) => `to:${e}`).join(" OR ") : `to:${EMAIL_PREFIX}`;
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(q)}`, { method: "DELETE", signal: AbortSignal.timeout(5000) });
    void res;
  } catch {
    /* mail clean-up is best effort */
  }
}

/** Removes the given test users and the mails sent to them. */
export async function cleanupUsers(emails: string[]) {
  if (emails.length === 0) return;
  const list = emails.map(lit).join(",");
  deleteUsersWhere(`email in (${list})`);
  await purgeMail(emails);
}

/** Removes every user created by any real-e2e run. */
export async function cleanupAllTestData() {
  deleteUsersWhere(`email like ${lit(LIKE)}`);
  await purgeMail(null);
}
