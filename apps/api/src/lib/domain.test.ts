import { describe, expect, it } from 'vitest';
import {
  isRestoreWindowOpen,
  isStrictlyEditable,
  normalizeMoodTags,
  validatePageRange,
  validateStatusExtras,
  validateStatusTransition
} from './domain.js';
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

  it('accepts pause reason only when pausing and note only when starting to read', () => {
    expect(() => validateStatusExtras('PAUSED', { pauseReason: '先读完另一本' })).not.toThrow();
    expect(() => validateStatusExtras('READING', { note: '这次重点看第三章' })).not.toThrow();
    expect(() => validateStatusExtras('READING', { pauseReason: '不属于这里' })).toThrow(AppError);
    expect(() => validateStatusExtras('PAUSED', { note: '不属于这里' })).toThrow(AppError);
    expect(() => validateStatusExtras('READ', { note: 'x', pauseReason: 'y' })).toThrow(AppError);
    expect(() => validateStatusExtras('ABANDONED', {})).not.toThrow();
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
