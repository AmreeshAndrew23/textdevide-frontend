// Display helpers for a generated app's Run-mode UI — how a raw stored value reads to the end user
// (dates, numbers, status badges, initials avatars) and how a grid exports to CSV. Pure functions,
// no React, so they're trivially testable and shared by the grid, the form and the dashboard.

export function pluralize(word) {
  if (!word) return "";
  if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
  return `${word}s`;
}

// Status-like values get a meaningful color (a "Cancelled" claim reads red, "Paid" green) —
// checked danger → warning → success so e.g. "Unpaid"/"Inactive" never match the success rule.
// Anything else gets a stable color from a hash of the value, so the same value is always the
// same color across rows.
const DANGER = /(cancel|reject|denied|declin|fail|overdue|inactive|lost|expired|blocked|refund|terminat|suspend|closed lost|critical|high)/i;
const WARNING = /(pending|draft|booked|open|progress|review|waiting|scheduled|unpaid|hold|checked in|submitted|partial|medium|requested)/i;
const SUCCESS = /^(active|approved|paid|complete|completed|done|resolved|delivered|yes|available|in stock|verified|success|accepted|closed won|low|confirmed|published)$/i;
const HASH_TONES = ["info", "purple", "teal", "neutral"];

export function toneForValue(value) {
  const s = String(value ?? "").trim();
  if (!s) return "neutral";
  if (DANGER.test(s)) return "danger";
  if (WARNING.test(s)) return "warning";
  if (SUCCESS.test(s)) return "success";
  let h = 0;
  for (const ch of s.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HASH_TONES[h % HASH_TONES.length];
}

export function formatDate(value) {
  if (!value) return "";
  const s = String(value);
  // A bare YYYY-MM-DD is a calendar date, not an instant — parse it as local midnight so it never
  // shifts a day in timezones west of UTC.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00`) : new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatNumber(value, type) {
  if (value === "" || value == null) return "";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return type === "decimal"
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toLocaleString();
}

// Plain-text rendering of a value — what the CSV export and search see.
export function displayText(value, fieldType) {
  if (value == null || value === "") return "";
  if (fieldType === "date") return formatDate(value);
  if (fieldType === "integer" || fieldType === "decimal") return formatNumber(value, fieldType);
  if (fieldType === "boolean") return value === true || value === "true" ? "Yes" : "No";
  return String(value);
}

export function initials(text) {
  const parts = String(text || "").trim().split(/[\s._@-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

const AVATAR_COLORS = [
  ["#e0e7ff", "#4338ca"], ["#dcfce7", "#15803d"], ["#fef3c7", "#b45309"], ["#fce7f3", "#be185d"],
  ["#e0f2fe", "#0369a1"], ["#ede9fe", "#6d28d9"], ["#ccfbf1", "#0f766e"], ["#ffe4e6", "#be123c"],
];
export function avatarColors(text) {
  let h = 0;
  for (const ch of String(text || "")) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// headers: string[]; rows: string[][] (already display text) — RFC 4180 quoting, CRLF rows.
export function toCsv(headers, rows) {
  return [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
}
