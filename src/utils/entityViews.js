// Which ways of looking at an entity's records make sense, read from its own field types — the
// difference between a generated app that is "a table per entity" and one that shows
// reservations on a calendar, leads on a board and properties as photo cards.
//   table    always
//   board    an enum status-like field (columns per value)
//   calendar a date field (month grid)
//   gallery  an image field (photo cards)
//   timeline a date field (records grouped by day)

const STATUS_PRIMARY = /(status|stage|state)$/i;
const STATUS_SECONDARY = /(priority|severity|level|type|category|outcome|result)$/i;
const WHEN_PRIMARY = /(appointment|scheduled|due|deadline|start|visit|event|reservation|booking|checkin|check_in|date)$/i;
const CALENDAR_FIRST = /(appointment|reservation|booking|event|schedule|meeting|visit|class|session|shift|slot|exam|bill)/i;
const BOARD_FIRST = /(task|lead|deal|claim|ticket|issue|request|application|case|opportunit|bug|work ?order|job|order)/i;

export const VIEW_LABELS = { table: "Table", board: "Board", calendar: "Calendar", gallery: "Gallery", timeline: "Timeline" };

export function viewFields(fields) {
  const enums = fields.filter((f) => f.type === "enum" && f.values.length >= 2 && f.values.length <= 8);
  const dates = fields.filter((f) => f.type === "date" && !/(dob|birth)/i.test(f.name));
  return {
    status: enums.find((f) => STATUS_PRIMARY.test(f.name)) || enums.find((f) => STATUS_SECONDARY.test(f.name)) || enums[0] || null,
    date: dates.find((f) => WHEN_PRIMARY.test(f.name)) || dates[0] || null,
    image: fields.find((f) => f.type === "image") || null,
  };
}

export function availableViews(vf) {
  return ["table", vf.status && "board", vf.date && "calendar", vf.image && "gallery", vf.date && "timeline"].filter(Boolean);
}

// The view an entity opens in, before the user picks one: photos win, then a calendar for
// things that happen on a day, then a board for things that move through stages.
export function defaultView(vf, entityName) {
  const name = String(entityName || "").replace(/([a-z])([A-Z])/g, "$1 $2");
  if (vf.image) return "gallery";
  if (vf.date && CALENDAR_FIRST.test(name)) return "calendar";
  if (vf.status && BOARD_FIRST.test(name)) return "board";
  return "table";
}

// "YYYY-MM-DD" in LOCAL time — the key a calendar cell and a stored date value are matched on.
export function dateKey(value) {
  if (!value) return null;
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && s.length <= 10) return s.slice(0, 10);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The 6×7 cells of a month view, Monday-first, including the trailing/leading days of the
// neighbouring months (flagged inMonth: false) so every week row is complete.
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Monday = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - offset + i);
    return { date: d, key: dateKey(d), inMonth: d.getMonth() === month };
  });
}

// Records grouped by day for the timeline, newest first; undated records are left out.
export function groupByDay(rows, field) {
  const groups = new Map();
  for (const row of rows) {
    const key = dateKey(row[field]);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([key, items]) => ({ key, items }));
}
