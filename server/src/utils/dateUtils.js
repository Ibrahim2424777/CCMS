// Pakistan (Asia/Karachi) is UTC+5 year-round - no DST to account for.
const PAKISTAN_OFFSET_MINUTES = 5 * 60;

// A Date object whose UTC getters (getUTCDate/getUTCDay/etc.) read as
// Pakistan's current local wall-clock date/time, regardless of the server's
// own system timezone. Reading via UTC getters (not local getters) is what
// keeps this safe - see server/src/config/db.js for the related DATE
// type-parser fix and why local-timezone-dependent Date handling is unsafe here.
function pakistanNow() {
  const now = new Date();
  return new Date(now.getTime() + PAKISTAN_OFFSET_MINUTES * 60000);
}

function toDateString(d) {
  return d.toISOString().slice(0, 10);
}

function todayInPakistan() {
  return toDateString(pakistanNow());
}

function daysAgoInPakistan(n) {
  const d = pakistanNow();
  d.setUTCDate(d.getUTCDate() - n);
  return toDateString(d);
}

// Monday of the current week (ISO-style week start).
function startOfWeekInPakistan() {
  const d = pakistanNow();
  const dayOfWeek = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = (dayOfWeek + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return toDateString(d);
}

function startOfMonthInPakistan() {
  const d = pakistanNow();
  d.setUTCDate(1);
  return toDateString(d);
}

// { from, to } spanning the full previous calendar month. Relies on the
// well-defined JS Date behavior that day-of-month 0 rolls back to the last
// day of the previous month.
function previousMonthBoundsInPakistan() {
  const d = pakistanNow();
  d.setUTCDate(1); // 1st of current month
  d.setUTCDate(0); // -> last day of previous month
  const to = toDateString(d);
  d.setUTCDate(1); // -> 1st of that same (previous) month
  const from = toDateString(d);
  return { from, to };
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

// Inclusive day count between two 'YYYY-MM-DD' strings.
function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b - a) / (1000 * 60 * 60 * 24)) + 1;
}

const VALID_RANGES = [
  'today',
  'yesterday',
  'last7days',
  'last30days',
  'thisWeek',
  'thisMonth',
  'previousMonth',
  'custom',
];

// Resolves one of the eight master-context range keys to a concrete
// { from, to } (both inclusive, 'YYYY-MM-DD'). Assumes the caller has
// already validated `range` is in VALID_RANGES and, for 'custom', that
// customFrom/customTo are valid date strings with customFrom <= customTo -
// this function does no HTTP-facing validation itself, so it can be reused
// anywhere a resolved range is needed (MASTER CONTEXT section 17;
// ARCHITECTURE.md section 14 planned this as one shared utility).
function resolveDateRange(range, customFrom, customTo) {
  const today = todayInPakistan();

  switch (range) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = daysAgoInPakistan(1);
      return { from: yesterday, to: yesterday };
    }
    case 'last7days':
      return { from: daysAgoInPakistan(6), to: today };
    case 'last30days':
      return { from: daysAgoInPakistan(29), to: today };
    case 'thisWeek':
      return { from: startOfWeekInPakistan(), to: today };
    case 'thisMonth':
      return { from: startOfMonthInPakistan(), to: today };
    case 'previousMonth':
      return previousMonthBoundsInPakistan();
    case 'custom':
      return { from: customFrom, to: customTo };
    default:
      throw new Error(`Unknown date range: ${range}`);
  }
}

module.exports = {
  todayInPakistan,
  daysAgoInPakistan,
  startOfWeekInPakistan,
  startOfMonthInPakistan,
  previousMonthBoundsInPakistan,
  isValidDateString,
  daysBetween,
  resolveDateRange,
  VALID_RANGES,
};
