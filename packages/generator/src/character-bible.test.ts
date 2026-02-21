import { describe, it, expect } from 'vitest';
import {
  DEFAULT_CHARACTERS,
  getCharacterByName,
  getCharactersForAge,
} from './character-bible.js';

describe('DEFAULT_CHARACTERS', () => {
  it('has at least 5 characters', () => {
    expect(DEFAULT_CHARACTERS.length).toBeGreaterThanOrEqual(5);
  });

  it('all characters have required fields', () => {
    for (const char of DEFAULT_CHARACTERS) {
      expect(char.name.length).toBeGreaterThan(0);
      expect(char.description.length).toBeGreaterThan(10);
      expect(char.personality.length).toBeGreaterThan(10);
      expect(char.appearance.length).toBeGreaterThan(10);
      expect(char.catchphrases.length).toBeGreaterThanOrEqual(2);
      expect(char.ageRange).toMatch(/^\d+-\d+$/);
      expect(char.teachingStyle.length).toBeGreaterThan(10);
      expect(Object.keys(char.styleSheet).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes Cosmo the robot', () => {
    const cosmo = DEFAULT_CHARACTERS.find((c) => c.name === 'Cosmo');
    expect(cosmo).toBeDefined();
    expect(cosmo!.description).toContain('robot');
    expect(cosmo!.ageRange).toBe('2-6');
  });

  it('includes Melody the fairy', () => {
    const melody = DEFAULT_CHARACTERS.find((c) => c.name === 'Melody');
    expect(melody).toBeDefined();
    expect(melody!.description).toContain('musical');
  });

  it('includes Professor Paws the cat', () => {
    const paws = DEFAULT_CHARACTERS.find((c) => c.name === 'Professor Paws');
    expect(paws).toBeDefined();
    expect(paws!.description).toContain('cat');
    expect(paws!.ageRange).toBe('4-8');
  });

  it('includes Brave Bea the bear', () => {
    const bea = DEFAULT_CHARACTERS.find((c) => c.name === 'Brave Bea');
    expect(bea).toBeDefined();
    expect(bea!.description).toContain('bear');
  });

  it('includes Pixel & Dot the math sprites', () => {
    const pd = DEFAULT_CHARACTERS.find((c) => c.name === 'Pixel & Dot');
    expect(pd).toBeDefined();
    expect(pd!.description).toContain('math');
  });

  it('all characters have unique names', () => {
    const names = DEFAULT_CHARACTERS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('all characters have distinct teaching styles', () => {
    const styles = DEFAULT_CHARACTERS.map((c) => c.teachingStyle);
    // Styles should all be different
    expect(new Set(styles).size).toBe(styles.length);
  });
});

describe('getCharacterByName', () => {
  it('finds characters case-insensitively', () => {
    expect(getCharacterByName('cosmo')).toBeDefined();
    expect(getCharacterByName('COSMO')).toBeDefined();
    expect(getCharacterByName('Cosmo')).toBeDefined();
  });

  it('returns undefined for unknown characters', () => {
    expect(getCharacterByName('Unknown Character')).toBeUndefined();
  });

  it('returns the correct character', () => {
    const melody = getCharacterByName('Melody');
    expect(melody?.name).toBe('Melody');
    expect(melody?.description).toContain('musical');
  });
});

describe('getCharactersForAge', () => {
  it('returns characters appropriate for toddlers (2-4)', () => {
    const chars = getCharactersForAge('2-4');
    expect(chars.length).toBeGreaterThanOrEqual(2);
    // Cosmo (2-6) and Melody (2-5) should be included
    expect(chars.some((c) => c.name === 'Cosmo')).toBe(true);
    expect(chars.some((c) => c.name === 'Melody')).toBe(true);
  });

  it('returns characters appropriate for preschool (4-6)', () => {
    const chars = getCharactersForAge('4-6');
    expect(chars.length).toBeGreaterThanOrEqual(3);
    // Should include most characters
    expect(chars.some((c) => c.name === 'Cosmo')).toBe(true);
    expect(chars.some((c) => c.name === 'Professor Paws')).toBe(true);
  });

  it('returns characters appropriate for early school (6-8)', () => {
    const chars = getCharactersForAge('6-8');
    expect(chars.length).toBeGreaterThanOrEqual(1);
    // Professor Paws (4-8) should be included
    expect(chars.some((c) => c.name === 'Professor Paws')).toBe(true);
  });

  it('excludes characters outside the age range', () => {
    const chars = getCharactersForAge('6-8');
    // Melody (2-5) should NOT be included for 6-8
    expect(chars.some((c) => c.name === 'Melody')).toBe(false);
  });

  it('handles overlapping age ranges correctly', () => {
    // Brave Bea (3-7) should appear for 4-6 (overlap at 4-6)
    const chars = getCharactersForAge('4-6');
    expect(chars.some((c) => c.name === 'Brave Bea')).toBe(true);
  });
});
