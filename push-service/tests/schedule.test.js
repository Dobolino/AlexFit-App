import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReminder, nextReminder } from '../src/schedule.js';

const reminder = (extra = {}) => ({ enabled: true, time: '18:00', timeZone: 'Europe/Zurich', days: [1, 2, 3, 5, 6], ...extra });
const iso = (value) => new Date(value).toISOString();

test('validates and normalizes schedules without accepting malformed dates or zones', () => {
  assert.deepEqual(validateReminder(reminder({ days: [6, 1, 1] })).days, [1, 6]);
  assert.equal(nextReminder({ enabled: false }, Date.now()), null);
  for (const invalid of [
    null, { enabled: 'yes' }, reminder({ time: '24:00' }), reminder({ time: '7:00' }),
    reminder({ timeZone: 'No/SuchZone' }), reminder({ days: [0] }), reminder({ days: [] }),
    reminder({ days: [1.5] }), reminder({ days: ['1'] }),
  ]) assert.throws(() => validateReminder(invalid), RangeError);
  assert.throws(() => nextReminder(reminder(), NaN), RangeError);
});

test('finds the next selected weekday and treats the trigger as strictly after', () => {
  const value = reminder();
  assert.equal(iso(nextReminder(value, Date.parse('2026-11-16T16:59:59Z'))), '2026-11-16T17:00:00.000Z');
  assert.equal(iso(nextReminder(value, Date.parse('2026-11-16T17:00:00Z'))), '2026-11-17T17:00:00.000Z');
  assert.equal(iso(nextReminder(value, Date.parse('2026-11-18T17:00:00Z'))), '2026-11-20T17:00:00.000Z');
  assert.equal(iso(nextReminder(reminder({ days: [1] }), Date.parse('2026-11-16T17:00:00Z'))), '2026-11-23T17:00:00.000Z');
});

test('keeps Zurich local clock time across the spring DST boundary', () => {
  const value = reminder({ time: '18:00', days: [7] });
  assert.equal(iso(nextReminder(value, Date.parse('2026-03-28T20:00:00Z'))), '2026-03-29T16:00:00.000Z');
});

test('moves a nonexistent Zurich spring time forward by the DST gap', () => {
  const value = reminder({ time: '02:30', days: [7] });
  assert.equal(iso(nextReminder(value, Date.parse('2026-03-28T20:00:00Z'))), '2026-03-29T01:30:00.000Z');
  assert.equal(iso(nextReminder(value, Date.parse('2026-03-29T01:30:00Z'))), '2026-04-05T00:30:00.000Z');
});

test('picks the first repeated Zurich autumn time and never repeats the same local date', () => {
  const value = reminder({ time: '02:30', days: [7] });
  assert.equal(iso(nextReminder(value, Date.parse('2026-10-24T20:00:00Z'))), '2026-10-25T00:30:00.000Z');
  assert.equal(iso(nextReminder(value, Date.parse('2026-10-25T00:30:00Z'))), '2026-11-01T01:30:00.000Z');
  assert.equal(iso(nextReminder(value, Date.parse('2026-10-25T01:10:00Z'))), '2026-11-01T01:30:00.000Z');
});

test('handles UTC midnight and fractional-offset zones without assuming whole-hour offsets', () => {
  const midnight = reminder({ time: '00:00', timeZone: 'UTC', days: [1] });
  assert.equal(iso(nextReminder(midnight, Date.parse('2026-11-15T23:59:59Z'))), '2026-11-16T00:00:00.000Z');
  const kathmandu = reminder({ time: '06:15', timeZone: 'Asia/Kathmandu', days: [1] });
  assert.equal(iso(nextReminder(kathmandu, Date.parse('2026-11-15T22:00:00Z'))), '2026-11-16T00:30:00.000Z');
});

test('advances calendar dates correctly over year boundaries', () => {
  const value = reminder({ time: '09:00', timeZone: 'Pacific/Auckland', days: [5] });
  assert.equal(iso(nextReminder(value, Date.parse('2026-12-31T12:00:00Z'))), '2026-12-31T20:00:00.000Z');
});

test('supports a thirty-minute DST gap instead of assuming a one-hour transition', () => {
  const value = reminder({ time: '02:15', timeZone: 'Australia/Lord_Howe', days: [7] });
  assert.equal(iso(nextReminder(value, Date.parse('2026-10-03T12:00:00Z'))), '2026-10-03T15:45:00.000Z');
});
