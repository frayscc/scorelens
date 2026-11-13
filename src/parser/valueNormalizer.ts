import type { MetricType } from '../models/project';

function text(value: unknown): string {
  return String(value ?? '').trim();
}

export function normalizeScore(value: unknown, nullTokens: string[]): number | null {
  const raw = text(value);
  if (nullTokens.includes(raw)) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = Number(raw.replace(/,/g, ''));
  return Number.isFinite(normalized) ? normalized : null;
}

export function normalizeGrade(value: unknown, nullTokens: string[]): string | null {
  const raw = text(value);
  if (nullTokens.includes(raw)) return null;
  return raw.normalize('NFKC').replace(/\s+/g, '').toUpperCase() || null;
}

export function normalizeRank(value: unknown, nullTokens: string[]): number | null {
  const raw = text(value);
  if (nullTokens.includes(raw) || /[↑↓+-]/.test(raw)) return null;
  const match = raw.match(/^(?:第)?\s*(\d+)\s*(?:名)?$/);
  return match ? Number.parseInt(match[1], 10) : null;
}

export function normalizeRankChange(value: unknown, nullTokens: string[]): number | null {
  const raw = text(value).normalize('NFKC');
  if (nullTokens.includes(raw)) return null;
  const match = raw.match(/^\s*([↑↓+-])?\s*(\d+)\s*(?:名)?\s*$/);
  if (!match) return null;
  const amount = Number.parseInt(match[2], 10);
  return match[1] === '↓' || match[1] === '-' ? -amount : amount;
}

export function normalizeMetric(metric: MetricType, value: unknown, nullTokens: string[]): number | string | null {
  if (metric === 'grade') return normalizeGrade(value, nullTokens);
  if (metric === 'gradeRank') return normalizeRank(value, nullTokens);
  if (metric === 'sourceRankChange') return normalizeRankChange(value, nullTokens);
  return normalizeScore(value, nullTokens);
}
