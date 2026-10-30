import { useState } from "react";
import { LuCheck, LuLock, LuMail, LuUser } from "react-icons/lu";
import { api, setToken } from "../api";
import { currentAccent } from "../accent";
import { brandLogo } from "../logo";

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
