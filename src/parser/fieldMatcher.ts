import type { AliasDictionary, FieldMapping, MetricType, SubjectDefinition } from '../models/project';

const simplify = (value: string) => value.normalize('NFKC').replace(/[\s/_·|()（）【】\[\]-]/g, '').toLowerCase();

export function detectSubject(header: string, subjects: SubjectDefinition[]): { subjectId: string; confidence: number } | null {
  const source = simplify(header);
  const matches = subjects.flatMap((subject) => [subject.name, ...subject.aliases]
    .filter((alias) => source.includes(simplify(alias)))
    .map((alias) => ({ subjectId: subject.id, confidence: simplify(alias) === source ? 0.92 : 0.88, length: alias.length })));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

export function detectMetric(header: string, aliases: AliasDictionary): { metric: MetricType; confidence: number } | null {
  const source = simplify(header);
  const order: MetricType[] = ['sourceRankChange', 'gradeRank', 'grade', 'score'];
  for (const metric of order) {
    const alias = [...aliases.metrics[metric]].sort((a, b) => b.length - a.length).find((item) => source.includes(simplify(item)));
    if (alias) return { metric, confidence: simplify(alias) === source ? 0.94 : 0.9 };
  }
  return null;
}

export function matchField(header: string, index: number, subjects: SubjectDefinition[], aliases: AliasDictionary): FieldMapping {
  const source = simplify(header);
  if (/^(学号|学生编号|学生学号)$/.test(source)) return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'studentId' }, confidence: 0.99 };
  if (/^(姓名|学生姓名)$/.test(source)) return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'studentName' }, confidence: 0.99 };

  const subject = detectSubject(header, subjects);
  const metric = detectMetric(header, aliases);
  if (subject) {
    return {
      sourceColumnIndex: index,
      sourceHeader: header,
      target: { type: 'subject', subjectId: subject.subjectId, metric: metric?.metric ?? 'score' },
      confidence: metric ? Math.min(subject.confidence, metric.confidence) : subject.confidence >= 0.92 ? subject.confidence : 0.78,
    };
  }
  if (/总分|总成绩/.test(source)) return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'total', metric: metric?.metric ?? 'score' }, confidence: 0.94 };
  if (/总/.test(source) && metric) return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'total', metric: metric.metric }, confidence: 0.9 };
  if (['校次', '级次'].includes(source)) {
    return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'total', metric: 'gradeRank' }, confidence: 0.94 };
  }
  if (metric?.metric === 'sourceRankChange' && aliases.metrics.sourceRankChange.some((alias) => simplify(alias) === source)) {
    return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'total', metric: 'sourceRankChange' }, confidence: 0.86 };
  }
  return { sourceColumnIndex: index, sourceHeader: header, target: { type: 'ignore' }, confidence: 0.25 };
}

export function findMappingConflicts(mappings: FieldMapping[]): number[][] {
  const keys = new Map<string, number[]>();
  for (const mapping of mappings) {
    const target = mapping.target;
    if (target.type === 'ignore') continue;
    const key = target.type === 'subject' ? `subject:${target.subjectId}:${target.metric}`
      : target.type === 'total' ? `total:${target.metric}` : target.type;
    keys.set(key, [...(keys.get(key) ?? []), mapping.sourceColumnIndex]);
  }
  return [...keys.values()].filter((columns) => columns.length > 1);
}
