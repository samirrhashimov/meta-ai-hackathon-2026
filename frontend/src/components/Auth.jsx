import { useState } from "react";
import { LuArrowLeft, LuLock, LuMail, LuSparkles, LuUser } from "react-icons/lu";
import { api, setToken } from "../api";
import { currentAccent } from "../accent";
import logo from "../assets/flama_icon_dark.png";

// Auth page: login or register card on an ambient backdrop.
// onDone(user) hands the fresh session back to App.
export default function Auth({ mode = "login", onDone, onBack }) {
  const acc = currentAccent();
  const isLogin = mode === "login";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
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
      <button onClick={onBack} className="land-back">
        <LuArrowLeft size={15} />
        Back
      </button>
      <div className="land-auth-wrap">
        <div className="glass land-auth-card land-rise">
          <img src={logo} alt="Flama" className="land-auth-logo" />
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
                    placeholder="Ada Lovelace"
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
                  placeholder={isLogin ? "Your password" : "At least 6 characters"}
                  type="password"
                  required
                  minLength={isLogin ? undefined : 6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                />
              </span>
            </label>
            {error && <p className="land-auth-error">{error}</p>}
            <button type="submit" disabled={busy} className={`land-btn land-btn-primary ${acc.solid}`}>
              {busy ? (
                "Please wait…"
              ) : (
                <>
                  <LuSparkles size={15} />
                  {isLogin ? "Log in" : "Create account"}
                </>
              )}
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
  );
}
