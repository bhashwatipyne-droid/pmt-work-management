import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { Layers, Loader2 } from "lucide-react";

export default function LoginPage() {
  const { login } = useUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : "Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1e39] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-500/90">
            <Layers className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="text-lg font-semibold tracking-tight text-white">
            PMT <span className="font-normal text-slate-400">Prototype</span>
          </div>
        </div>

        <form
          data-testid="login-form"
          onSubmit={handleSubmit}
          className="rounded-xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur"
        >
          <h1 className="mb-1 text-lg font-semibold text-white">Sign in</h1>
          <p className="mb-6 text-sm text-slate-400">Use your work email and password to continue.</p>

          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Email</label>
          <input
            data-testid="login-email-input"
            type="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mb-4 w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />

          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Password</label>
          <input
            data-testid="login-password-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-5 w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />

          {error && (
            <div data-testid="login-error-message" className="mb-4 rounded-md bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          <button
            data-testid="login-submit-btn"
            type="submit"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-500 px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
