import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Eye, EyeOff, Layers, Loader2 } from "lucide-react";
import { trackEvent } from "@/analytics";
import { requestPasswordReset, resetPassword } from "@/services/api";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15";
const LABEL_CLASS =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";
const SUBMIT_CLASS =
  "flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:opacity-50";

// The emailed reset link opens the app at /?reset_token=...
const readResetToken = () => {
  try {
    return new URLSearchParams(window.location.search).get("reset_token") || "";
  } catch {
    return "";
  }
};

const BackToSignIn = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-4 flex w-full items-center justify-center gap-1.5 text-sm font-medium text-[#2b2bb5] hover:underline"
  >
    <ArrowLeft className="h-4 w-4" />
    Back to sign in
  </button>
);

// "Forgot password?": asks for the username or email and sends a reset link.
function ForgotPasswordCard({ initialLogin, onBack }) {
  const [login, setLogin] = useState(initialLogin || "");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const data = await requestPasswordReset(login.trim());
      setSent(data?.message || "If an account matches, a reset link has been sent.");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send the reset link. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      data-testid="forgot-password-form"
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-7 shadow-sm"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Forgot password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Enter your username or work email and we will email you a link to choose a new password.
      </p>

      {sent ? (
        <div
          data-testid="forgot-password-sent"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
        >
          {sent} The link works once and expires in 30 minutes. If your account has no email on
          file, ask an admin to reset your password.
        </div>
      ) : (
        <>
          <label htmlFor="forgot-login" className={LABEL_CLASS}>
            Username or Email
          </label>
          <input
            id="forgot-login"
            data-testid="forgot-password-input"
            type="text"
            required
            autoFocus
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="you@company.com"
            autoComplete="username"
            className={`${INPUT_CLASS} mb-5`}
          />

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={submitting || !login.trim()} className={SUBMIT_CLASS}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Sending..." : "Send reset link"}
          </button>
        </>
      )}

      <BackToSignIn onClick={onBack} />
    </form>
  );
}

// Opened from the emailed link: choose a new password.
function ResetPasswordCard({ token, onDone, onBack }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword(token, password);
      onDone();
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Could not reset the password. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      data-testid="reset-password-form"
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-card p-7 shadow-sm"
    >
      <h1 className="text-xl font-semibold tracking-tight text-foreground">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        At least 8 characters. You will use it the next time you sign in.
      </p>

      <label htmlFor="reset-password" className={LABEL_CLASS}>
        New password
      </label>
      <div className="relative mb-4">
        <input
          id="reset-password"
          data-testid="reset-password-input"
          type={showPassword ? "text" : "password"}
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          className={`${INPUT_CLASS} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      <label htmlFor="reset-confirm" className={LABEL_CLASS}>
        Confirm password
      </label>
      <input
        id="reset-confirm"
        data-testid="reset-confirm-input"
        type={showPassword ? "text" : "password"}
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        autoComplete="new-password"
        className={`${INPUT_CLASS} mb-5`}
      />

      {error && (
        <div
          data-testid="reset-password-error"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <button type="submit" disabled={submitting} className={SUBMIT_CLASS}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitting ? "Saving..." : "Set new password"}
      </button>

      <BackToSignIn onClick={onBack} />
    </form>
  );
}

// `onResetDone` / `onResetCancel` let the app know the password-reset screen is
// finished - it is shown from the emailed link even when someone is signed in.
export default function LoginPage({ onResetDone, onResetCancel } = {}) {
  const { login } = useUser();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // "signin" | "forgot" | "reset" (the last one when opened from the emailed link).
  const [resetToken] = useState(readResetToken);
  const [view, setView] = useState(resetToken ? "reset" : "signin");
  const [notice, setNotice] = useState("");

  // Back to the plain sign-in page; drops the token from the address bar.
  const showSignIn = (message = "") => {
    if (resetToken) window.history.replaceState({}, "", window.location.pathname);
    setNotice(message);
    setView("signin");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(loginId.trim(), password);
    } catch (err) {
      const detail = err.response?.data?.detail;

      trackEvent("login_failed", {
        login_method: "password",
        reason: typeof detail === "string" ? detail : "invalid_credentials",
      });

      setError(
        typeof detail === "string"
          ? detail
          : "Invalid username/email or password"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] px-4">
      <div className="w-full max-w-[400px]">
        {/* Brand */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#2b2bb5] shadow-sm">
              <Layers className="h-5 w-5 text-white" />
            </div>

            <span className="text-xl font-semibold tracking-tight text-foreground">
              PMT
            </span>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            Work management platform
          </p>
        </div>

        {view === "forgot" && (
          <ForgotPasswordCard initialLogin={loginId} onBack={() => showSignIn()} />
        )}

        {view === "reset" && (
          <ResetPasswordCard
            token={resetToken}
            onDone={() => {
              showSignIn("Password updated. Sign in with your new password.");
              onResetDone?.();
            }}
            onBack={() => {
              showSignIn();
              onResetCancel?.();
            }}
          />
        )}

        {/* Login card */}
        {view === "signin" && (
        <form
          data-testid="login-form"
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border bg-card p-7 shadow-sm"
        >
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Sign in
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Use your username or work email and password to continue.
            </p>
          </div>

          {notice && (
            <div
              data-testid="login-notice"
              className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800"
            >
              {notice}
            </div>
          )}

          {/* Username / Email */}
          <div className="mb-4">
            <label
              htmlFor="login-username"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Username or Email
            </label>

            <input
              id="login-username"
              data-testid="login-username-input"
              type="text"
              required
              autoFocus
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="you@company.com"
              autoComplete="username"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
            />
          </div>

          {/* Password */}
          <div className="mb-5">
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Password
            </label>

            <div className="relative">
              <input
                id="login-password"
                data-testid="login-password-input"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className="h-10 w-full rounded-lg border border-input bg-card px-3 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="-mt-3 mb-5 text-right">
            <button
              type="button"
              data-testid="forgot-password-link"
              onClick={() => {
                setNotice("");
                setView("forgot");
              }}
              className="text-xs font-medium text-[#2b2bb5] hover:underline"
            >
              Forgot password?
            </button>
          </div>

          {/* Error */}
          {error && (
            <div
              data-testid="login-error-message"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            data-testid="login-submit-btn"
            type="submit"
            disabled={submitting}
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1a1a8a] focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}

            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
        )}

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          PMT · Work Management
        </p>
      </div>
    </div>
  );
}