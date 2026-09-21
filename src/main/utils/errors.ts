import type { ApiResult } from '../../shared/types.js';

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
    public readonly retryable = false
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toApiError(error: unknown): ApiResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.message, field: error.field, retryable: error.retryable } };
  }
  const message = error instanceof Error ? error.message : 'An unexpected operation error occurred.';
  if (/UNIQUE constraint failed/i.test(message)) {
    return { ok: false, error: { code: 'DUPLICATE_RECORD', message: 'A record with the same unique identifier already exists. Please review the highlighted information.' } };
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return { ok: false, error: { code: 'RELATED_RECORD', message: 'This operation could not be completed because related records must be preserved.' } };
  }
  if (/database is locked|busy/i.test(message)) {
    return { ok: false, error: { code: 'DATABASE_BUSY', message: 'Dentiva is completing another data operation. Please wait a moment and try again.', retryable: true } };
  }
  return { ok: false, error: { code: 'UNEXPECTED_ERROR', message: 'The operation could not be completed. Diagnostic details have been recorded securely.' } };
}

export function assertText(value: unknown, label: string, min = 1, max = 500): string {
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', `${label} is required.`, label);
  const cleaned = value.trim();
  if (cleaned.length < min) throw new AppError('VALIDATION_ERROR', `${label} must contain at least ${min} characters.`, label);
  if (cleaned.length > max) throw new AppError('VALIDATION_ERROR', `${label} cannot exceed ${max} characters.`, label);
  return cleaned;
}

export function optionalText(value: unknown, max = 10_000): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new AppError('VALIDATION_ERROR', 'A text value is invalid.');
  const cleaned = value.trim();
  if (cleaned.length > max) throw new AppError('VALIDATION_ERROR', `Text cannot exceed ${max} characters.`);
  return cleaned || null;
}

export function assertUuid(value: unknown, label = 'Record'): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AppError('VALIDATION_ERROR', `${label} identifier is invalid.`);
  }
  return value;
}

export function assertIsoDate(value: unknown, label: string, dateOnly = false): string {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) {
    throw new AppError('VALIDATION_ERROR', `${label} is not a valid date.`, label);
  }
  if (dateOnly && !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new AppError('VALIDATION_ERROR', `${label} is not a valid date.`, label);
  return value;
}

export function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new AppError('VALIDATION_ERROR', `${label} must be a valid non-negative amount.`, label);
  }
  return value;
}
