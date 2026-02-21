import { describe, it, expect } from 'vitest';
import { parseDuration } from '@kidsvid/shared';

describe('parseDuration', () => {
  it('parses hours, minutes, and seconds', () => {
    expect(parseDuration('PT1H2M3S')).toBe(3723);
  });

  it('parses minutes and seconds', () => {
    expect(parseDuration('PT5M30S')).toBe(330);
  });

  it('parses minutes only', () => {
    expect(parseDuration('PT3M')).toBe(180);
  });

  it('parses seconds only', () => {
    expect(parseDuration('PT45S')).toBe(45);
  });

  it('parses hours only', () => {
    expect(parseDuration('PT2H')).toBe(7200);
  });

  it('returns 0 for invalid format', () => {
    expect(parseDuration('')).toBe(0);
    expect(parseDuration('invalid')).toBe(0);
  });

  it('parses zero duration', () => {
    expect(parseDuration('PT0S')).toBe(0);
  });

  it('parses large values', () => {
    expect(parseDuration('PT10H59M59S')).toBe(39599);
  });
});
