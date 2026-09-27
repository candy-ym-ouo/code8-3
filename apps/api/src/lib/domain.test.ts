import { describe, expect, it } from 'vitest';
import { deriveReadingRound, isRestoreWindowOpen, isStrictlyEditable, normalizeMoodTags, validatePageRange, validateStatusTransition } from './domain.js';
import { AppError } from './errors.js';

describe('domain rules', () => {
  it('allows declared status transitions', () => {
    expect(() => validateStatusTransition('READING', 'READ')).not.toThrow();
    expect(() => validateStatusTransition('READ', 'READING')).not.toThrow();
  });

  it('rejects illegal status transitions', () => {
    expect(() => validateStatusTransition('TO_READ', 'READ')).toThrow(AppError);
    expect(() => validateStatusTransition('ABANDONED', 'READING')).toThrow(AppError);
  });

  it('keeps one round across pause/resume and opens a new round only after finishing', () => {
    expect(deriveReadingRound('TO_READ', 'READING', 0)).toBe(1);
    expect(deriveReadingRound('READING', 'PAUSED', 1)).toBe(1);
    expect(deriveReadingRound('PAUSED', 'READING', 1)).toBe(1);
    expect(deriveReadingRound('READING', 'READ', 1)).toBe(1);
    expect(deriveReadingRound('READ', 'READING', 1)).toBe(2);
    expect(deriveReadingRound('PAUSED', 'READ', 2)).toBe(2);
  });

  it('validates page ranges and page count', () => {
    expect(() => validatePageRange(42, 44, 300)).not.toThrow();
    expect(() => validatePageRange(44, 42, 300)).toThrow(AppError);
    expect(() => validatePageRange(42, 301, 300)).toThrow(AppError);
  });

  it('normalizes mood tags and rejects empty or duplicate overrun', () => {
    expect(normalizeMoodTags(['MOVED', 'MOVED', 'CALM'])).toEqual(['MOVED', 'CALM']);
    expect(() => normalizeMoodTags([])).toThrow(AppError);
  });

  it('enforces restore and edit windows', () => {
    const now = new Date('2026-09-24T12:00:00.000Z');
    expect(isRestoreWindowOpen(new Date('2026-09-24T00:00:00.000Z'), now)).toBe(true);
    expect(isRestoreWindowOpen(new Date('2026-09-22T00:00:00.000Z'), now)).toBe(false);
    expect(isStrictlyEditable(new Date('2026-09-25T00:00:00.000Z'), now)).toBe(true);
    expect(isStrictlyEditable(new Date('2026-09-23T00:00:00.000Z'), now)).toBe(false);
  });
});
