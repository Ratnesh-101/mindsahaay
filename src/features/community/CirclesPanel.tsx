import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import "../chat/i18n";
import { CONTENT_NS } from "../journal/registerBundle";
import { errorClass, fieldClass, hintClass, labelClass, noticeClass } from "../journal/ui";
import HelplineLinks from "../chat/HelplineLinks";
import Icon from "../../shared/ui/Icon";
import Modal from "../../shared/ui/Modal";
import {
  REPORT_REASONS,
  fetchCircles,
  fetchMyCircleIds,
  fetchPosts,
  joinCircle,
  leaveCircle,
  reportPost,
  submitPost,
  type Circle,
  type Post,
  type ReportReason,
  type SubmitOutcome,
} from "./api";

type Load = "loading" | "ready" | "error";

/** Campus Circles: anonymous, AI pre-moderated peer posts with reporting. */
export default function CirclesPanel() {
  const { t } = useTranslation(CONTENT_NS);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [member, setMember] = useState<Set<string>>(new Set());
  const [load, setLoad] = useState<Load>("loading");
  const [openId, setOpenId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showNorms, setShowNorms] = useState(false);

  const refresh = useCallback(async () => {
    setLoad("loading");
    try {
      const [list, mine] = await Promise.all([fetchCircles(), fetchMyCircleIds()]);
      setCircles(list);
      setMember(new Set(mine));
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleMembership = async (circle: Circle) => {
    const isMember = member.has(circle.id);
    try {
      if (isMember) await leaveCircle(circle.id);
      else await joinCircle(circle.id);
      setMember((prev) => {
        const next = new Set(prev);
        if (isMember) next.delete(circle.id);
        else next.add(circle.id);
        return next;
      });
      setMessage("");
    } catch {
      setMessage(t("community.joinError"));
    }
  };

  const open = circles.find((c) => c.id === openId) ?? null;

  return (
    <div className="campus-circles-wrap">
      <div className="directory-head">
        <div>
          <span className="eyebrow green">{t("community.eyebrow")}</span>
          <h2 className="text-2xl font-bold">{t("community.title")}</h2>
          <p>{t("community.subtitle")}</p>
        </div>
        <button type="button" className="outline-btn min-h-11" onClick={() => setShowNorms(true)}>
          <Icon name="shield" size={16} /> {t("community.norms")}
        </button>
      </div>

      {load === "loading" && (
        <p role="status" className="muted">
          {t("community.loading")}
        </p>
      )}
      {load === "error" && (
        <div role="alert" className={errorClass}>
          <p>{t("community.loadError")}</p>
          <button type="button" className="primary-btn mt-2 min-h-11" onClick={() => void refresh()}>
            {t("common.retry")}
          </button>
        </div>
      )}
      {load === "ready" && circles.length === 0 && <p className="muted">{t("community.empty")}</p>}
      <p role="status" aria-live="polite" className={message ? errorClass : "sr-only"}>
        {message}
      </p>

      <ul className="circles-grid m-0 list-none p-0" aria-label={t("community.listLabel")}>
        {circles.map((c) => {
          const isMember = member.has(c.id);
          return (
            <li key={c.id} className="circle-card panel">
              <div className="circle-top">
                <span className="story-theme">{c.category}</span>
                {isMember && <span className="capacity-badge">{t("community.joined")}</span>}
              </div>
              <h3>{c.name}</h3>
              <p className="circle-desc">{c.description}</p>
              <div className="circle-cta-row flex flex-wrap gap-2">
                <button
                  type="button"
                  className={isMember ? "outline-btn min-h-11" : "primary-btn min-h-11"}
                  onClick={() => void toggleMembership(c)}
                >
                  {isMember ? t("community.leave") : t("community.join")}
                </button>
                <button
                  type="button"
                  className="outline-btn min-h-11"
                  aria-pressed={openId === c.id}
                  aria-label={t("community.open", { name: c.name })}
                  onClick={() => setOpenId(openId === c.id ? null : c.id)}
                >
                  {t("community.members")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {open && <CircleFeed key={open.id} circle={open} isMember={member.has(open.id)} />}

      {showNorms && <NormsModal onClose={() => setShowNorms(false)} />}
    </div>
  );
}

function NormsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(CONTENT_NS);
  return (
    <Modal onClose={onClose} ariaLabel={t("community.normsTitle")}>
      <div className="modal-head">
        <h3>{t("community.normsTitle")}</h3>
        <button type="button" className="icon-btn" onClick={onClose} aria-label={t("community.normsCloseIcon")}>
          <Icon name="x" />
        </button>
      </div>
      <div className="care-plan-list">
        {(["norm1", "norm2", "norm3"] as const).map((k) => (
          <div className="care-step" key={k}>
            <span className="soft-icon mint">
              <Icon name="shield" />
            </span>
            <div>
              <strong>{t(`community.${k}Title`)}</strong>
              <p>{t(`community.${k}`)}</p>
            </div>
          </div>
        ))}
      </div>
      <button type="button" className="primary-btn full min-h-11" onClick={onClose}>
        {t("community.normsClose")}
      </button>
    </Modal>
  );
}

function CircleFeed({ circle, isMember }: { circle: Circle; isMember: boolean }) {
  const { t } = useTranslation(CONTENT_NS);
  const [posts, setPosts] = useState<Post[]>([]);
  const [load, setLoad] = useState<Load>("loading");
  const [reporting, setReporting] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    setLoad("loading");
    try {
      setPosts(await fetchPosts(circle.id));
      setLoad("ready");
    } catch {
      setLoad("error");
    }
  }, [circle.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="panel mt-6" aria-labelledby={`feed-${circle.id}`}>
      <h3 id={`feed-${circle.id}`} className="text-lg font-bold">
        {t("community.postsTitle", { name: circle.name })}
      </h3>

      {isMember ? (
        <PostComposer circleId={circle.id} onPosted={() => void refresh()} />
      ) : (
        <p className={`${noticeClass} mt-3`}>{t("community.joinFirst")}</p>
      )}

      <p role="status" aria-live="polite" className={notice ? `${noticeClass} mt-3` : "sr-only"}>
        {notice}
      </p>

      {load === "loading" && (
        <p role="status" className="muted mt-3">
          {t("community.loading")}
        </p>
      )}
      {load === "error" && (
        <p role="alert" className={`${errorClass} mt-3`}>
          {t("community.postsError")}
        </p>
      )}
      {load === "ready" && posts.length === 0 && <p className="muted mt-3">{t("community.noPosts")}</p>}

      <ul className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
        {posts.map((p) => (
          <li key={p.id} className="rounded-xl border border-[var(--line)] p-4">
            <h4 className="font-bold">{p.title}</h4>
            <p className={hintClass}>
              {t("community.anonymousAuthor")} ·{" "}
              {new Date(p.createdAt).toLocaleDateString()}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{p.content}</p>
            {p.likesCount > 0 && <p className={hintClass}>{t("community.likes", { count: p.likesCount })}</p>}
            {reporting === p.id ? (
              <ReportForm
                postId={p.id}
                onDone={(ok) => {
                  setReporting(null);
                  setNotice(ok ? t("community.reportSent") : t("community.reportError"));
                }}
              />
            ) : (
              <button
                type="button"
                className="text-btn min-h-6"
                aria-label={t("community.reportAction", { title: p.title })}
                onClick={() => setReporting(p.id)}
              >
                {t("community.reportTitle")}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ReportForm({ postId, onDone }: { postId: string; onDone: (ok: boolean) => void }) {
  const { t } = useTranslation(CONTENT_NS);
  const [reason, setReason] = useState<ReportReason>("self_harm");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    selectRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await reportPost(postId, reason, details);
      onDone(true);
    } catch {
      onDone(false);
    }
  };

  return (
    <form className="mt-3 flex flex-col gap-2 rounded-xl bg-[var(--canvas)] p-3" onSubmit={(e) => void submit(e)}>
      <label htmlFor={`rr-${postId}`} className={labelClass}>
        {t("community.reportReason")}
      </label>
      <select
        id={`rr-${postId}`}
        ref={selectRef}
        className={fieldClass}
        value={reason}
        onChange={(e) => setReason(e.target.value as ReportReason)}
      >
        {REPORT_REASONS.map((r) => (
          <option key={r} value={r}>
            {t(`community.reasonsList.${r}`)}
          </option>
        ))}
      </select>
      <label htmlFor={`rd-${postId}`} className={labelClass}>
        {t("community.reportDetails")}
      </label>
      <textarea id={`rd-${postId}`} className={fieldClass} value={details} maxLength={500} onChange={(e) => setDetails(e.target.value)} />
      <div className="flex gap-2">
        <button type="submit" className="primary-btn min-h-11" disabled={busy}>
          {t("community.reportSubmit")}
        </button>
        <button type="button" className="outline-btn min-h-11" onClick={() => onDone(true)} disabled={busy}>
          {t("community.reportCancel")}
        </button>
      </div>
    </form>
  );
}

function PostComposer({ circleId, onPosted }: { circleId: string; onPosted: () => void }) {
  const { t } = useTranslation(CONTENT_NS);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);
  const [error, setError] = useState("");
  const crisisRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (outcome?.kind === "crisis") crisisRef.current?.focus();
  }, [outcome]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError("");
    setOutcome(null);
    if (!title.trim() || !content.trim()) {
      setError(t("community.contentRequired"));
      return;
    }
    setBusy(true);
    try {
      const result = await submitPost({ circleId, title: title.trim(), content: content.trim(), isAnonymous: anonymous });
      setOutcome(result);
      if (result.kind === "posted" || result.kind === "queued") {
        setTitle("");
        setContent("");
        onPosted();
      }
    } catch {
      setError(t("community.checkFailed"));
    } finally {
      setBusy(false);
    }
  };

  let outcomeText = "";
  if (outcome?.kind === "posted") outcomeText = outcome.redacted ? t("community.postedRedacted") : t("community.posted");
  if (outcome?.kind === "queued") outcomeText = t("community.queued");
  if (outcome?.kind === "rejected") {
    outcomeText = t("community.rejected");
    if (outcome.reasons.length) outcomeText += ` ${t("community.reasons", { reasons: outcome.reasons.join(", ") })}`;
  }

  return (
    <form className="mt-3 flex flex-col gap-3" onSubmit={(e) => void submit(e)} aria-labelledby="composer-title" noValidate>
      <h4 id="composer-title" className="font-bold">
        {t("community.composeTitle")}
      </h4>
      <div>
        <label htmlFor="post-title" className={labelClass}>
          {t("community.postTitle")}
        </label>
        <input id="post-title" className={fieldClass} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label htmlFor="post-content" className={labelClass}>
          {t("community.postContent")}
        </label>
        <textarea
          id="post-content"
          className={`${fieldClass} min-h-28`}
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-5 w-5" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
        {t("community.anonymous")}
      </label>
      <p className={hintClass}>{t("community.reviewNote")}</p>
      <button type="submit" className="primary-btn min-h-11 self-start" disabled={busy}>
        {busy ? t("community.checking") : t("community.publish")}
      </button>
      <div role="status" aria-live="polite">
        {outcomeText && <p className={noticeClass}>{outcomeText}</p>}
      </div>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {outcome?.kind === "crisis" && (
        <section role="alert" data-testid="community-crisis" className="rounded-xl border-2 border-[var(--danger)] bg-[var(--amber-soft)] p-4">
          <h4 ref={crisisRef} tabIndex={-1} className="font-bold">
            {t("community.crisisTitle")}
          </h4>
          <p className="my-1 text-sm">{t("community.crisisBody")}</p>
          <HelplineLinks />
          <p className={`${hintClass} mt-2`}>{t("community.crisisKeep")}</p>
        </section>
      )}
    </form>
  );
}
