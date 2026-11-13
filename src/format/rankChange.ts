export type RankChangeTone = 'progress' | 'decline' | 'neutral';

export function formatRankChange(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value > 0) return `↑ ${value}`;
  if (value < 0) return `↓ ${Math.abs(value)}`;
  return '0';
}

export function rankChangeTone(value: number | null | undefined): RankChangeTone {
  if (value == null || value === 0) return 'neutral';
  return value > 0 ? 'progress' : 'decline';
}
