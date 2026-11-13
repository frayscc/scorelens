export type RankDifferenceClass = 'advantage' | 'weakness' | 'normal' | 'unavailable';

export function calculateRankDifference(subjectRank: number | null | undefined, totalRank: number | null | undefined): number | null {
  return subjectRank == null || totalRank == null ? null : subjectRank - totalRank;
}

export function classifyRankDifference(difference: number | null, threshold: number): RankDifferenceClass {
  if (difference == null) return 'unavailable';
  if (difference >= threshold) return 'weakness';
  if (difference <= -threshold) return 'advantage';
  return 'normal';
}
