export type MetricType = 'score' | 'grade' | 'gradeRank' | 'sourceRankChange';

export interface ManualOverrideInfo {
  modified: boolean;
  modifiedAt?: string;
  originalValue?: unknown;
}

export interface MetricSet {
  score?: number | null;
  grade?: string | null;
  gradeRank?: number | null;
  sourceRankChange?: number | null;
  manualOverrides?: Partial<Record<MetricType, ManualOverrideInfo>>;
}

export interface Student {
  studentId: string;
  name: string;
  status: 'active' | 'inactive';
  admissionType?: 'regular' | 'transfer';
  createdAt: string;
}

export interface ExamStudentData {
  studentId: string;
  total?: MetricSet | null;
  subjects: Record<string, MetricSet | null>;
}

export type FieldTarget =
  | { type: 'studentId' }
  | { type: 'studentName' }
  | { type: 'total'; metric: MetricType }
  | { type: 'subject'; subjectId: string; metric: MetricType }
  | { type: 'ignore' };

export interface FieldMapping {
  sourceColumnIndex: number;
  sourceHeader: string;
  target: FieldTarget;
  confidence: number;
}

export interface ExamCapabilities {
  canViewScores: boolean;
  canAnalyzeRankDifference: boolean;
  canRenderRadar: boolean;
  canAnalyzeTotalRankTrend: boolean;
}

export interface ExamSource {
  originalFileName?: string;
  sheetName?: string;
  headerStartRow?: number;
  headerDepth?: number;
  dataStartRow?: number;
  rawTable?: unknown[][];
  fieldMapping?: FieldMapping[];
}

export interface Exam {
  examId: string;
  name: string;
  order: number;
  source: ExamSource;
  students: Record<string, ExamStudentData>;
  capabilities: ExamCapabilities;
  createdAt: string;
  updatedAt: string;
}

export interface SubjectDefinition {
  id: string;
  name: string;
  builtIn: boolean;
  aliases: string[];
}

export interface AliasDictionary {
  metrics: Record<MetricType, string[]>;
  nullTokens: string[];
}

export interface ProjectSettings {
  rankDifferenceThreshold: number;
}

export interface ScoreLensProject {
  schemaVersion: 1;
  projectId: string;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  students: Student[];
  exams: Exam[];
  subjects: SubjectDefinition[];
  aliases: AliasDictionary;
  settings: ProjectSettings;
}
