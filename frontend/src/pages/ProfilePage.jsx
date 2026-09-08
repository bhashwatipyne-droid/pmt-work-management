import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Save, UserRound } from "lucide-react";
import { useUser } from "@/context/UserContext";

const FieldLabel = ({ children, htmlFor }) => (
  <label
    htmlFor={htmlFor}
    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
  >
    {children}
  </label>
);

export default function ProfilePage() {
  const { currentUser, updateCurrentUserProfile } = useUser();
  const [username, setUsername] = useState(currentUser?.username || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingUsername, setSavingUsername] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [usernameMessage, setUsernameMessage] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");

  const saveUsername = async (event) => {
    event.preventDefault();
    setUsernameMessage("");
    setUsernameError("");
    setSavingUsername(true);
    try {
      await updateCurrentUserProfile({ username: username.trim() });
      setUsernameMessage("Username updated successfully.");
    } catch (err) {
      setUsernameError(err.response?.data?.detail || "Could not update username.");
    } finally {
      setSavingUsername(false);
    }
  };

  const savePassword = async (event) => {
    event.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirmation do not match.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    setSavingPassword(true);
    try {
      await updateCurrentUserProfile({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password changed successfully.");
    } catch (err) {
      setPasswordError(err.response?.data?.detail || "Could not change password.");
    } finally {
      setSavingPassword(false);
    }
  };

  if (!currentUser) return null;

  const initials = (currentUser.name || "U")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const passwordField = (id, label, value, setValue, visible, setVisible, autoComplete) => (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          autoComplete={autoComplete}
          className="h-10 w-full rounded-lg border border-input bg-white px-3 pr-10 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#2b2bb5]/20"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#f7f9fc] px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Profile & Account</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your username and password.
          </p>
        </div>

        <div className="mb-5 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f0f0fd] text-sm font-semibold text-[#1a1a8a]">
              {initials}
            </div>
            <div>
              <div className="text-base font-semibold text-foreground">{currentUser.name}</div>
              <div className="mt-0.5 text-sm text-muted-foreground">{currentUser.email || "No email available"}</div>
              <div className="mt-1 text-xs capitalize text-muted-foreground">{currentUser.role}</div>
            </div>
          </div>
        </div>

        <section className="mb-5 rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <UserRound className="h-4 w-4 text-[#2b2bb5]" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Username</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">This is what you can use to sign in.</p>
            </div>
          </div>
          <form onSubmit={saveUsername} className="p-5">
            <FieldLabel htmlFor="profile-username">Username</FieldLabel>
            <input
              id="profile-username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              className="h-10 w-full rounded-lg border border-input bg-white px-3 text-sm text-foreground outline-none transition-colors focus:border-[#2b2bb5] focus:ring-2 focus:ring-[#2b2bb5]/15"
            />
            {usernameError && <p className="mt-2 text-xs text-red-600">{usernameError}</p>}
            {usernameMessage && <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />{usernameMessage}</p>}
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={savingUsername} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50">
                <Save className="h-3.5 w-3.5" />
                {savingUsername ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        </section>

        <section className="rounded-xl border border-border bg-card">
          <div className="flex items-center gap-3 border-b border-border px-5 py-4">
            <KeyRound className="h-4 w-4 text-[#2b2bb5]" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">Change password</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Use at least 8 characters for your new password.</p>
            </div>
          </div>
          <form onSubmit={savePassword} className="space-y-4 p-5">
            {passwordField("profile-current-password", "Current password", currentPassword, setCurrentPassword, showCurrent, setShowCurrent, "current-password")}
            {passwordField("profile-new-password", "New password", newPassword, setNewPassword, showNew, setShowNew, "new-password")}
            {passwordField("profile-confirm-password", "Confirm new password", confirmPassword, setConfirmPassword, showConfirm, setShowConfirm, "new-password")}
            {passwordError && <p className="text-xs text-red-600">{passwordError}</p>}
            {passwordMessage && <p className="flex items-center gap-1.5 text-xs text-emerald-600"><Check className="h-3.5 w-3.5" />{passwordMessage}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={savingPassword} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#2b2bb5] px-4 text-sm font-medium text-white hover:bg-[#1a1a8a] disabled:cursor-not-allowed disabled:opacity-50">
                <Save className="h-3.5 w-3.5" />
                {savingPassword ? "Changing..." : "Change password"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
