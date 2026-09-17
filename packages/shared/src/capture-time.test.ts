import { describe, expect, it } from 'vitest';
import { applyClockOffset, parseExifDateTime } from './capture-time.js';

const UB = 'Asia/Ulaanbaatar';

describe('parseExifDateTime', () => {
  it('interprets offset-less EXIF time in the event time zone', () => {
    expect(parseExifDateTime('2026:06:14 09:30:15', undefined, UB)?.toISOString()).toBe('2026-06-14T01:30:15.000Z');
  });

  it('prefers the camera-recorded offset over the event zone', () => {
    expect(parseExifDateTime('2026:06:14 09:30:15', '-05:00', UB)?.toISOString()).toBe('2026-06-14T14:30:15.000Z');
    expect(parseExifDateTime('2026:06:14 09:30:15', '+05:45', UB)?.toISOString()).toBe('2026-06-14T03:45:15.000Z');
  });

  it('handles daylight saving zones', () => {
    // Нью-Йорк: зун UTC-4, өвөл UTC-5
    expect(parseExifDateTime('2026:07:01 12:00:00', undefined, 'America/New_York')?.toISOString()).toBe('2026-07-01T16:00:00.000Z');
    expect(parseExifDateTime('2026:01:15 12:00:00', undefined, 'America/New_York')?.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  it('rejects missing, zeroed and impossible dates', () => {
    expect(parseExifDateTime(undefined, undefined, UB)).toBeNull();
    expect(parseExifDateTime('0000:00:00 00:00:00', undefined, UB)).toBeNull();
    expect(parseExifDateTime('1970:01:01 00:00:00', undefined, UB)).toBeNull();
    expect(parseExifDateTime('2026:02:31 10:00:00', undefined, UB)).toBeNull();
    expect(parseExifDateTime('2026:06:14 24:00:00', undefined, UB)).toBeNull();
    expect(parseExifDateTime('garbage', undefined, UB)).toBeNull();
  });

  it('ignores a malformed offset and falls back to the zone', () => {
    expect(parseExifDateTime('2026:06:14 09:30:15', '8', UB)?.toISOString()).toBe('2026-06-14T01:30:15.000Z');
  });
});

describe('applyClockOffset', () => {
  it('shifts a camera running 2 minutes slow forward', () => {
    const raw = new Date('2026-06-14T01:30:15Z');
    expect(applyClockOffset(raw, 120)?.toISOString()).toBe('2026-06-14T01:32:15.000Z');
    expect(applyClockOffset(raw, -30)?.toISOString()).toBe('2026-06-14T01:29:45.000Z');
    expect(applyClockOffset(null, 120)).toBeNull();
  });
});
