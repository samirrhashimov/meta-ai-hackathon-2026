import { useEffect, useState } from "react";
import { LuCheck, LuLock, LuMail, LuUser } from "react-icons/lu";
import { api, apiBaseUrl, setToken } from "../api";
import { currentAccent } from "../accent";
import { brandLogo } from "../logo";
import { WindowBar } from "./WindowControls";

// Auth page: split card with a live filing animation and the form.
// onDone(user) hands the fresh session back to App.

// Register password policy. Mirrors validatePassword on the backend.
const PASS_RULES = [
  { label: "At least 8 characters", test: (v) => v.length >= 8 },
  { label: "One uppercase letter", test: (v) => /[A-Z]/.test(v) },
  { label: "One number", test: (v) => /[0-9]/.test(v) },
  { label: "Passwords match", test: (v, c) => v !== "" && v === c },
];

export default function Auth({ mode = "login", onDone, onBack, theme = "dark" }) {
  const logo = brandLogo(theme);
  const acc = currentAccent();
  const isLogin = mode === "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canSubmit = isLogin || PASS_RULES.every((r) => r.test(password, confirm));

  // A failed Google return stores its message here before routing to login.
  useEffect(() => {
    try {
      const msg = sessionStorage.getItem("flama.auth.error");
      if (msg) {
        sessionStorage.removeItem("flama.auth.error");
        // One-shot mount read: there is no event to subscribe to.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setError(msg);
      }
    } catch {
      // storage unavailable: default state stands
    }
  }, []);

  // Google blocks sign in inside embedded WebViews, so desktop opens the
  // system browser and returns through the flama:// deep link.
  async function googleLogin() {
    setError("");
    const dest = `${apiBaseUrl()}/api/auth/google?mode=${
      typeof window !== "undefined" && window.__TAURI_INTERNALS__ ? "app" : "web"
    }`;
    if (typeof window !== "undefined" && window.__TAURI_INTERNALS__) {
      try {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(dest);
        return;
      } catch {
        // opener unavailable: fall through to same tab navigation
      }
    }
    window.location.href = dest;
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!isLogin && !PASS_RULES.every((r) => r.test(password, confirm))) {
      setError(
        password !== confirm
          ? "Passwords do not match."
          : "Password does not meet every rule yet."
      );
      return;
    }
    setBusy(true);
    try {
      const res = isLogin
        ? await api.login(email.trim(), password)
        : await api.register(email.trim(), password, name.trim());
      setToken(res.token);
      onDone(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="land-root">
      <div className="land-orb land-orb-a" />
      <div className="land-orb land-orb-b" />
      <WindowBar backTo="#/" />
      <div className="land-auth-wrap">
        <div className="glass land-auth-card land-rise">
          <img src={logo} alt="Flama" className="land-auth-logo" />
          <div className="land-auth-main">
            <h1 className="land-auth-title">
              {isLogin ? "Welcome back" : "Create your account"}
            </h1>
            <p className="land-auth-sub">
              {isLogin
                ? "Log in to open your notes and files."
                : "One account, every note and file in its place."}
            </p>
            <form onSubmit={submit} className="land-auth-form">
              {!isLogin && (
                <label className="land-field">
                  <span className="land-field-label">Name</span>
                  <span className="land-field-box">
                    <LuUser size={15} className="land-field-icon" />
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="John"
                      maxLength={60}
                      autoComplete="name"
                    />
                  </span>
                </label>
              )}
              <label className="land-field">
                <span className="land-field-label">Email</span>
                <span className="land-field-box">
                  <LuMail size={15} className="land-field-icon" />
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    type="email"
                    required
                    autoComplete="email"
                  />
                </span>
              </label>
              <label className="land-field">
                <span className="land-field-label">Password</span>
                <span className="land-field-box">
                  <LuLock size={15} className="land-field-icon" />
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isLogin ? "Your password" : "At least 8 characters"}
                    type="password"
                    required
                    minLength={isLogin ? undefined : 8}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                  />
                </span>
              </label>
              {!isLogin && (
                <label className="land-field">
                  <span className="land-field-label">Confirm password</span>
                  <span className="land-field-box">
                    <LuLock size={15} className="land-field-icon" />
                    <input
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete="new-password"
                    />
                  </span>
                </label>
              )}
              {!isLogin && (
                <ul className="land-pass-rules" aria-live="polite">
                  {PASS_RULES.map((r) => {
                    const ok = r.test(password, confirm);
                    return (
                      <li key={r.label} className={ok ? "land-pass-ok" : ""}>
                        <LuCheck size={13} />
                        {r.label}
                      </li>
                    );
                  })}
                </ul>
              )}
              {error && <p className="land-auth-error">{error}</p>}
              <button type="submit" disabled={busy || !canSubmit} className={`land-btn land-btn-primary ${acc.solid}`}>
                {busy ? "Please wait…" : isLogin ? "Log in" : "Create account"}
              </button>
            </form>
            <div className="land-auth-div">
              <span>or</span>
            </div>
            <button type="button" onClick={googleLogin} className="land-btn land-auth-google">
              <svg viewBox="0 0 48 48" width="17" height="17" aria-hidden="true">
                <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.4 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
                <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
              </svg>
              Continue with Google
            </button>
            <p className="land-auth-switch">
              {isLogin ? (
                <>
                  New here? <a href="#/register">Create an account</a>
                </>
              ) : (
                <>
                  Have an account? <a href="#/login">Log in</a>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
