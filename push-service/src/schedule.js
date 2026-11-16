const DAY = 86400000;
const formatters = new Map();

function formatter(timeZone) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat('en-US', {
      timeZone,
      calendar: 'gregory',
      numberingSystem: 'latn',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    // Bound the cache even when many devices supply different valid zones.
    if (formatters.size >= 32) formatters.delete(formatters.keys().next().value);
    formatters.set(timeZone, value);
  }
  return value;
}

function parts(at, fmt) {
  const values = {};
  for (const item of fmt.formatToParts(at))
    if (item.type !== 'literal') values[item.type] = Number(item.value);
  return values;
}

function utc(value) {
  const date = new Date(0);
  date.setUTCFullYear(value.year, value.month - 1, value.day);
  date.setUTCHours(value.hour || 0, value.minute || 0, value.second || 0, 0);
  return date.getTime();
}

export function validateReminder(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      typeof input.enabled !== 'boolean') throw new RangeError('Invalid reminder');
  const time = input.time ?? (input.enabled ? null : '18:00');
  const timeZone = input.timeZone ?? (input.enabled ? null : 'UTC');
  const days = input.days ?? (input.enabled ? null : []);
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new RangeError('Invalid reminder time');
  if (typeof timeZone !== 'string' || timeZone.length > 80 || !timeZone ||
      /[^A-Za-z0-9_+\-/]/.test(timeZone)) throw new RangeError('Invalid time zone');
  try { formatter(timeZone); }
  catch { throw new RangeError('Invalid time zone'); }
  if (!Array.isArray(days) || days.length > 7 ||
      days.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
    throw new RangeError('Invalid reminder weekdays');
  const normalizedDays = [...new Set(days)].sort((a, b) => a - b);
  if (input.enabled && !normalizedDays.length) throw new RangeError('Choose reminder weekdays');
  return { enabled: input.enabled, time, timeZone, days: normalizedDays };
}

// Resolve a wall-clock time with Temporal's "compatible" DST semantics:
// use the first occurrence of a repeated hour, and move a missing hour forward
// by the transition gap. This also prevents a daily reminder firing twice.
function localInstant(local, fmt) {
  const wall = utc(local);
  const offsets = new Set();
  for (const delta of [-36 * 3600000, 0, 36 * 3600000]) {
    const at = wall + delta;
    offsets.add(utc(parts(at, fmt)) - at);
  }
  const exact = [], later = [];
  for (const offset of offsets) {
    const at = wall - offset;
    const observed = utc(parts(at, fmt));
    if (observed === wall) exact.push(at);
    else if (observed > wall) later.push({ at, gap: observed - wall });
  }
  if (exact.length) return Math.min(...exact);
  later.sort((a, b) => a.gap - b.gap || a.at - b.at);
  if (!later.length) throw new RangeError('Cannot resolve reminder time');
  return later[0].at;
}

export function nextReminder(input, after) {
  const reminder = validateReminder(input);
  if (!reminder.enabled) return null;
  if (!Number.isFinite(after) || !Number.isFinite(new Date(after).getTime()) ||
      Math.abs(after) > 8640000000000000 - 10 * DAY)
    throw new RangeError('Invalid reminder reference time');
  const fmt = formatter(reminder.timeZone);
  const today = parts(after, fmt);
  const start = utc({ year: today.year, month: today.month, day: today.day });
  const [hour, minute] = reminder.time.split(':').map(Number);
  let earliest = null;
  // Eight local calendar dates cover today plus the next occurrence of every
  // weekday. UTC date arithmetic here represents dates, not elapsed local days.
  for (let day = 0; day <= 7; day++) {
    const date = new Date(start + day * DAY);
    const weekday = date.getUTCDay() || 7;
    if (!reminder.days.includes(weekday)) continue;
    const at = localInstant({
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1,
      day: date.getUTCDate(), hour, minute, second: 0,
    }, fmt);
    if (at > after && (earliest === null || at < earliest)) earliest = at;
  }
  return earliest;
}
