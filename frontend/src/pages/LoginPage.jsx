import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { Layers, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useUser();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(loginId.trim(), password);
    } catch (err) {
      const detail = err.response?.data?.detail;
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

        {/* Login card */}
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

            <input
              id="login-password"
              data-testid="login-password-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
            />
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

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          PMT · Work Management
        </p>
      </div>
    </div>
  );
}