import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./i18n";
import { CONTENT_NS } from "./registerBundle";
import {
  MIN_PASSPHRASE_LENGTH,
  createVault,
  generateRecoveryCode,
  readVaultMeta,
  recoverVault,
  unlockVault,
  useVaultPassphrase,
  validateRecoveryCode,
  type VaultMeta,
} from "./vault";
import { errorClass, fieldClass, hintClass, labelClass, noticeClass } from "./ui";

type GateState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "setup"; step: "passphrase" | "code"; passphrase: string; code: string }
  | { kind: "locked"; meta: VaultMeta; mode: "passphrase" | "recovery" };

interface VaultGateProps {
  children: React.ReactNode;
}

/**
 * Renders children only while the vault is unlocked. Otherwise shows the passphrase setup
 * (with recovery code generation), the unlock form, or the recovery-code form.
 */
export default function VaultGate({ children }: VaultGateProps) {
  const { t } = useTranslation(CONTENT_NS);
  const passphrase = useVaultPassphrase();
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const [recoveredPassphrase, setRecoveredPassphrase] = useState<string | null>(null);
  const [showRecovered, setShowRecovered] = useState(false);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const meta = await readVaultMeta();
      if (meta) {
        setState({ kind: "locked", meta, mode: "passphrase" });
      } else {
        setState({ kind: "setup", step: "passphrase", passphrase: "", code: "" });
      }
    } catch {
      setState({ kind: "error" });
    }
  }, []);

  useEffect(() => {
    if (!passphrase) {
      void load();
    }
  }, [passphrase, load]);

  if (passphrase) {
    return (
      <>
        {recoveredPassphrase && (
          <div className={`${noticeClass} mb-4`} role="status">
            <strong>{t("vault.recoveredTitle")}</strong>
            <p>{t("vault.recoveredNote")}</p>
            <button
              type="button"
              className="outline-btn mt-2 min-h-6"
              aria-pressed={showRecovered}
              onClick={() => setShowRecovered((v) => !v)}
            >
              {showRecovered ? t("vault.hidePassphrase") : t("vault.showPassphrase")}
            </button>
            {showRecovered && (
              <p className="mt-2 font-mono text-[15px]" data-testid="recovered-passphrase">
                {recoveredPassphrase}
              </p>
            )}
          </div>
        )}
        {children}
      </>
    );
  }

  if (state.kind === "loading") {
    return (
      <div className="panel" role="status" aria-live="polite">
        {t("vault.loading")}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="panel">
        <p className={errorClass} role="alert">
          {t("vault.loadError")}
        </p>
        <button type="button" className="primary-btn mt-3" onClick={() => void load()}>
          {t("vault.retry")}
        </button>
      </div>
    );
  }

  if (state.kind === "setup") {
    return (
      <SetupFlow
        state={state}
        onChange={(next) => setState(next)}
      />
    );
  }

  return (
    <UnlockFlow
      meta={state.meta}
      mode={state.mode}
      onMode={(mode) => setState({ ...state, mode })}
      onRecovered={(p) => {
        setRecoveredPassphrase(p);
        setShowRecovered(false);
      }}
    />
  );
}

/** Moves focus to the heading when the step changes. It does not steal focus on first render. */
function useHeadingFocus(dep: unknown) {
  const ref = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.focus();
  }, [dep]);
  return ref;
}

interface SetupProps {
  state: Extract<GateState, { kind: "setup" }>;
  onChange: (s: GateState) => void;
}

function SetupFlow({ state, onChange }: SetupProps) {
  const { t } = useTranslation(CONTENT_NS);
  const headingRef = useHeadingFocus(state.step);
  const [pass, setPass] = useState(state.passphrase);
  const [confirm, setConfirm] = useState(state.passphrase);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const toCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (pass.trim().length < MIN_PASSPHRASE_LENGTH) {
      setError(t("vault.tooShort"));
      return;
    }
    if (pass !== confirm) {
      setError(t("vault.mismatch"));
      return;
    }
    setError("");
    onChange({ kind: "setup", step: "code", passphrase: pass, code: generateRecoveryCode() });
  };

  const create = async () => {
    if (!saved || busy) return;
    setBusy(true);
    setError("");
    try {
      await createVault(state.passphrase, state.code);
    } catch {
      setError(t("vault.createError"));
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(state.code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (state.step === "code") {
    return (
      <section className="panel" aria-labelledby="vault-code-title">
        <h2 id="vault-code-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold">
          {t("vault.recoveryTitle")}
        </h2>
        <p className="mt-2 text-sm">{t("vault.recoveryIntro")}</p>
        <div className={`${errorClass} mt-3`} role="note">
          <strong>{t("vault.warningTitle")}</strong>
          <p>{t("vault.warning")}</p>
        </div>
        <p className={`${labelClass} mt-4`} id="recovery-code-label">
          {t("vault.recoveryCodeLabel")}
        </p>
        <p
          aria-labelledby="recovery-code-label"
          className="select-all rounded-[10px] border border-[var(--line)] bg-[var(--canvas)] px-4 py-3 text-center font-mono text-xl tracking-widest"
          data-testid="recovery-code"
        >
          {state.code}
        </p>
        <button type="button" className="outline-btn mt-2 min-h-6" onClick={() => void copy()}>
          {t("vault.copy")}
        </button>
        <p role="status" className={hintClass}>
          {copied ? t("vault.copied") : ""}
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          <span>{t("vault.savedCheckbox")}</span>
        </label>
        {error && (
          <p className={`${errorClass} mt-3`} role="alert">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="outline-btn"
            onClick={() => onChange({ kind: "setup", step: "passphrase", passphrase: state.passphrase, code: "" })}
          >
            {t("vault.back")}
          </button>
          <button type="button" className="primary-btn" disabled={!saved || busy} onClick={() => void create()}>
            {busy ? t("vault.creating") : t("vault.createVault")}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="panel" onSubmit={toCode} aria-labelledby="vault-setup-title" noValidate>
      <h2 id="vault-setup-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        {t("vault.setupTitle")}
      </h2>
      <p className="mt-2 text-sm">{t("vault.setupIntro")}</p>
      <div className={`${errorClass} mt-3`} role="note">
        <strong>{t("vault.warningTitle")}</strong>
        <p>{t("vault.warning")}</p>
      </div>
      <div className="mt-4">
        <label htmlFor="vault-pass" className={labelClass}>
          {t("vault.passphraseLabel")}
        </label>
        <input
          id="vault-pass"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          aria-describedby="vault-pass-hint"
        />
        <p id="vault-pass-hint" className={hintClass}>
          {t("vault.passphraseHint")}
        </p>
      </div>
      <div className="mt-3">
        <label htmlFor="vault-confirm" className={labelClass}>
          {t("vault.confirmLabel")}
        </label>
        <input
          id="vault-confirm"
          type="password"
          autoComplete="new-password"
          className={fieldClass}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>
      {error && (
        <p className={`${errorClass} mt-3`} role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="primary-btn mt-4">
        {t("vault.continue")}
      </button>
    </form>
  );
}

interface UnlockProps {
  meta: VaultMeta;
  mode: "passphrase" | "recovery";
  onMode: (mode: "passphrase" | "recovery") => void;
  onRecovered: (passphrase: string) => void;
}

function UnlockFlow({ meta, mode, onMode, onRecovered }: UnlockProps) {
  const { t } = useTranslation(CONTENT_NS);
  const headingRef = useHeadingFocus(mode);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "passphrase") {
        await unlockVault(value, meta);
      } else {
        if (!validateRecoveryCode(value)) {
          setError(t("vault.badRecoveryFormat"));
          setBusy(false);
          return;
        }
        const recovered = await recoverVault(value, meta);
        onRecovered(recovered);
      }
    } catch {
      setError(mode === "passphrase" ? t("vault.wrongPassphrase") : t("vault.wrongRecovery"));
      setBusy(false);
    }
  };

  const recovery = mode === "recovery";
  return (
    <form className="panel" onSubmit={(e) => void submit(e)} aria-labelledby="vault-unlock-title" noValidate>
      <h2 id="vault-unlock-title" ref={headingRef} tabIndex={-1} className="text-xl font-bold">
        {t("vault.unlockTitle")}
      </h2>
      <p className="mt-2 text-sm">{t("vault.unlockIntro")}</p>
      <p className="mt-2 text-sm" data-testid="vault-locked-note">
        {t("vault.lockedNote")}
      </p>
      <div className="mt-4">
        <label htmlFor="vault-input" className={labelClass}>
          {recovery ? t("vault.recoveryLabel") : t("vault.passphraseLabel")}
        </label>
        <input
          id="vault-input"
          type={recovery ? "text" : "password"}
          autoComplete={recovery ? "off" : "current-password"}
          className={fieldClass}
          value={value}
          placeholder={recovery ? t("vault.recoveryPlaceholder") : undefined}
          onChange={(e) => setValue(e.target.value)}
        />
      </div>
      {error && (
        <p className={`${errorClass} mt-3`} role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? t("vault.unlocking") : recovery ? t("vault.recover") : t("vault.unlock")}
        </button>
        <button
          type="button"
          className="text-btn min-h-6"
          onClick={() => {
            setValue("");
            setError("");
            onMode(recovery ? "passphrase" : "recovery");
          }}
        >
          {recovery ? t("vault.usePassphrase") : t("vault.forgot")}
        </button>
      </div>
    </form>
  );
}
