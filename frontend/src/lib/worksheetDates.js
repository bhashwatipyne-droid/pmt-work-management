// Work dates are stored as "YYYY-MM-DD". Mirrors backend `validate_work_date`
// (backend/server.py) so the worksheet can refuse a half-typed date instead
// of saving it.

export const MIN_WORK_DATE = "2000-01-01";
export const MAX_WORK_DATE = "2100-12-31";

// A native date input reports "" while a segment is being cleared, and
// years like 0002 / 0020 / 0202 while "2026" is still being typed. Neither
// is a date anyone means, so only a complete, real date in a sensible range
// counts as valid.
export const isValidWorkDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  if (value < MIN_WORK_DATE || value > MAX_WORK_DATE) return false;

  // Rejects impossible dates such as 2026-02-31.
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};