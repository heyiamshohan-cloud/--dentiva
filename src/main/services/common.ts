import type { DentivaDatabase } from '../database/database.js';
import { AppError } from '../utils/errors.js';

export class CounterService {
  constructor(private readonly db: DentivaDatabase) {}

  next(clinicId: string, key: string, prefix: string, width = 6, includeYear = false): string {
    const row = this.db.get<{ current_value: number }>(`UPDATE counters SET current_value=current_value+1
      WHERE clinic_id=? AND counter_key=? RETURNING current_value`, clinicId, key);
    if (!row) throw new AppError('COUNTER_MISSING', `The ${key} number sequence is not configured. Open Settings to review numbering.`);
    const sequence = String(row.current_value).padStart(width, '0');
    return includeYear ? `${prefix}-${new Date().getFullYear()}-${sequence}` : `${prefix}-${sequence}`;
  }
}

export function pageBounds(page = 1, pageSize = 25): { page: number; pageSize: number; offset: number } {
  const safePageSize = Math.min(100, Math.max(10, Math.floor(Number(pageSize) || 25)));
  const safePage = Math.max(1, Math.floor(Number(page) || 1));
  return { page: safePage, pageSize: safePageSize, offset: (safePage - 1) * safePageSize };
}

export function escapeLike(value: string): string { return value.replace(/[\\%_]/g, (character) => `\\${character}`); }

export function ftsQuery(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 8).map((word) => `"${word.replaceAll('"', '""')}"*`).join(' AND ');
}

export function placeholders(count: number): string { return Array(count).fill('?').join(','); }
