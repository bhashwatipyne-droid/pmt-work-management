// A deterministic, distinct color per person for initials chips (the little
// circles showing someone's initials in the Work Sheet's Creator column,
// project collaborator stacks, the Efficiency table, and similar spots).
// Before this, every chip used the same single color, so at a glance in a
// dense table the only way to tell two people apart was reading the tiny
// initials themselves. The same key (a user's id, or a name where no id is
// available) always maps to the same color, and different people usually
// land on different colors, without needing to store a color per person
// anywhere.

const PALETTE = [
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
  { bg: "bg-purple-100", text: "text-purple-700" },
];

const FALLBACK = { bg: "bg-slate-100", text: "text-slate-600" };

// A small, fast string hash (not cryptographic - it only needs to spread
// names across the palette, not resist collisions).
const hashString = (value) => {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
};

// Returns "bg-x-100 text-x-700" (or similar) for the given key. Pass the
// person's user id where you have one (stable even if they're renamed, and
// tells two same-named people apart); fall back to their name only where no
// id is available, e.g. a free-text client contact.
export const avatarColorClasses = (key) => {
  if (!key) return `${FALLBACK.bg} ${FALLBACK.text}`;
  const { bg, text } = PALETTE[hashString(String(key)) % PALETTE.length];
  return `${bg} ${text}`;
};