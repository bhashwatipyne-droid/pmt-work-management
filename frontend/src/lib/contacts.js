// Shared helpers for client contacts (Clients page, Add client modal).

export const getInitials = (name = "") => {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

// Phone numbers: digits with an optional leading +, and spaces, dashes or
// brackets for readability. Letters used to be accepted.
export const cleanPhoneInput = (value) =>
  String(value || "")
    .replace(/[^0-9+\s\-()]/g, "")
    .replace(/(?!^)\+/g, "");

export const isValidPhone = (value) => {
  const text = String(value || "").trim();
  if (!text) return true; // phone is optional
  if (!/^\+?[0-9\s\-()]+$/.test(text)) return false;
  const digits = text.replace(/\D/g, "").length;
  return digits >= 7 && digits <= 15;
};

// Mail providers anyone can sign up with: sharing one of these says nothing
// about two contacts working for the same client.
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.in",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "rediffmail.com",
  "zoho.com",
]);
