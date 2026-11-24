import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ScoreLensProject, Student } from '../models/project';
import { buildRadarData, buildStudentSubjectRows, type RadarDatum, type StudentSubjectRow } from '../analytics/studentProfile';
import { buildRankTrendSeries, rankToY, splitTrendSegments, type TrendMetric, type TrendSeries } from '../analytics/trend';
import { A4, createChinesePdf, downloadPdf, drawCenteredText, fitText, PDF_COLORS } from './pdfCore';
import { drawCompactProfile, planProfilePages, profileLegend, wrapPdfText, PROFILE_TREND_COLORS, type ProfileDensity } from './profileLayout';

export type { ProfileDensity } from './profileLayout';

export const STUDENTS_PER_PROFILE_PAGE = 2;
export const PROFILE_FONT_SIZES = { body: 9, table: 8, section: 10.5, studentName: 16 } as const;

export interface StudentProfileReport {
  continuation?: number;
  student: Student;
  examName: string;
  totalScore: number | null;
  totalRank: number | null;
  totalGrade: string | null;
  subjects: StudentSubjectRow[];
  radar: RadarDatum[];
  trends: TrendSeries[];
}

export function buildStudentProfileReports(project: ScoreLensProject, studentIds: string[], examId: string, trendMetrics: TrendMetric[]): StudentProfileReport[] {
  const exam = project.exams.find((item) => item.examId === examId);
  const byId = new Map(project.students.map(student => [student.studentId, student]));
  const selected = [...new Set(studentIds)].flatMap(id => {
    const student = byId.get(id);
    return student?.status === 'active' ? [student] : [];
  });
  return selected.map((student) => {
    const data = exam?.students[student.studentId];
    const subjects = exam ? buildStudentSubjectRows(project, exam, student.studentId, project.settings.rankDifferenceThreshold) : [];
    return {
      student,
      examName: exam?.name ?? '未选择考试',
      totalScore: data?.total?.score ?? null,
      totalRank: data?.total?.gradeRank ?? null,
      totalGrade: data?.total?.grade ?? null,
      subjects,
      radar: buildRadarData(subjects),
      trends: buildRankTrendSeries(project, student.studentId, trendMetrics.length ? trendMetrics : ['total']),
    };
  });
}

export function paginateStudentProfiles<T>(reports: T[], pageSize = STUDENTS_PER_PROFILE_PAGE): T[][] {
  if (!reports.length) return [];
  const size = Math.max(1, pageSize);
  return Array.from({ length: Math.ceil(reports.length / size) }, (_, index) => reports.slice(index * size, (index + 1) * size));
}

const SERIES_COLORS = [PDF_COLORS.brand, rgb(.77, .42, .25), rgb(.21, .41, .66), rgb(.55, .35, .65), rgb(.63, .51, .16), rgb(.13, .52, .55)];
const show = (value: unknown) => value == null || value === '' ? '—' : String(value);

function drawStudentHeader(page: PDFPage, font: PDFFont, report: StudentProfileReport, x: number, top: number, width: number): void {
  const nameSize = fitText(font, report.student.name, 150, PROFILE_FONT_SIZES.studentName, 13);
  page.drawText(report.student.name, { x: x + 14, y: top - 25, size: nameSize, font, color: PDF_COLORS.brandDark });
  page.drawText(`学号 ${report.student.studentId}  ·  ${report.examName}`, { x: x + 14, y: top - 43, size: PROFILE_FONT_SIZES.body, font, color: PDF_COLORS.muted });
  const metrics = [['总分', report.totalScore], ['总排名', report.totalRank], ['总等级', report.totalGrade]] as const;
  const gap = 7;
  const boxWidth = 89;
  const startX = x + width - metrics.length * boxWidth - (metrics.length - 1) * gap - 13;
  metrics.forEach(([label, value], index) => {
    const boxX = startX + index * (boxWidth + gap);
    page.drawRectangle({ x: boxX, y: top - 48, width: boxWidth, height: 35, color: PDF_COLORS.brandSoft });
    page.drawText(label, { x: boxX + 8, y: top - 27, size: 8, font, color: PDF_COLORS.muted });
    page.drawText(show(value), { x: boxX + 8, y: top - 43, size: 13, font, color: PDF_COLORS.brandDark });
  });
}

function drawSubjectTable(page: PDFPage, font: PDFFont, rows: StudentSubjectRow[], x: number, top: number, width: number, height: number): void {
  page.drawText('学科表现', { x, y: top - 11, size: PROFILE_FONT_SIZES.section, font, color: PDF_COLORS.brandDark });
  page.drawText('排名差 = 学科排名 - 总排名', { x: x + 62, y: top - 10, size: 8, font, color: PDF_COLORS.muted });
  const headers = ['学科', '分数', '等级', '排名', '排名差'];
  const weights = [1.15, .85, .78, .92, .9];
  const total = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map((value) => width * value / total);
  const tableTop = top - 21;
  const rowHeight = Math.min(15, (height - 23) / Math.max(1, rows.length + 1));
  let cellX = x;
  page.drawRectangle({ x, y: tableTop - rowHeight, width, height: rowHeight, color: PDF_COLORS.brandSoft });
  headers.forEach((label, index) => {
    drawCenteredText(page, font, label, cellX, tableTop - rowHeight + (rowHeight - PROFILE_FONT_SIZES.table) / 2, widths[index], PROFILE_FONT_SIZES.table, PDF_COLORS.brandDark);
    cellX += widths[index];
  });
  rows.forEach((item, rowIndex) => {
    const y = tableTop - rowHeight * (rowIndex + 2);
    const values = [item.subject.name, item.metrics.score, item.metrics.grade, item.metrics.gradeRank, item.difference == null ? null : item.difference > 0 ? `+${item.difference}` : item.difference];
    let currentX = x;
    values.forEach((value, index) => {
      if (index > 0 && item.status === 'advantage') page.drawRectangle({ x: currentX, y, width: widths[index], height: rowHeight, color: PDF_COLORS.advantage });
      if (index > 0 && item.status === 'weakness') page.drawRectangle({ x: currentX, y, width: widths[index], height: rowHeight, color: PDF_COLORS.weakness });
      const color = index > 0 && item.status === 'advantage' ? PDF_COLORS.advantageText : index > 0 && item.status === 'weakness' ? PDF_COLORS.weaknessText : PDF_COLORS.ink;
      drawCenteredText(page, font, show(value), currentX, y + (rowHeight - PROFILE_FONT_SIZES.table) / 2, widths[index], PROFILE_FONT_SIZES.table, color);
      currentX += widths[index];
    });
    page.drawLine({ start: { x, y }, end: { x: x + width, y }, thickness: .3, color: PDF_COLORS.line });
  });
}

function radarPoint(index: number, count: number, value: number, cx: number, cy: number, radius: number): [number, number] {
  const angle = Math.PI / 2 - index * Math.PI * 2 / count;
  return [cx + Math.cos(angle) * radius * value / 6, cy + Math.sin(angle) * radius * value / 6];
}

function drawRadar(page: PDFPage, font: PDFFont, data: RadarDatum[], x: number, top: number, width: number, height: number): void {
  page.drawText('等级雷达', { x, y: top - 11, size: PROFILE_FONT_SIZES.section, font, color: PDF_COLORS.brandDark });
  if (data.length < 3) {
    drawCenteredText(page, font, '等级数据不足', x, top - height / 2, width, PROFILE_FONT_SIZES.body, PDF_COLORS.muted);
    return;
  }
  const cx = x + width / 2;
  const cy = top - height / 2 - 4;
  const radius = Math.min(width * .29, (height - 34) * .34);
  for (let ring = 1; ring <= 6; ring += 1) {
    const points = data.map((_, index) => radarPoint(index, data.length, ring, cx, cy, radius));
    points.forEach((point, index) => page.drawLine({ start: { x: point[0], y: point[1] }, end: { x: points[(index + 1) % points.length][0], y: points[(index + 1) % points.length][1] }, thickness: .35, color: PDF_COLORS.line }));
  }
  data.forEach((item, index) => {
    const outer = radarPoint(index, data.length, 6, cx, cy, radius);
    page.drawLine({ start: { x: cx, y: cy }, end: { x: outer[0], y: outer[1] }, thickness: .3, color: PDF_COLORS.line });
    const label = radarPoint(index, data.length, 7.4, cx, cy, radius);
    drawCenteredText(page, font, `${item.subjectName} ${item.grade}`, label[0] - 25, label[1] - 3, 50, 8, PDF_COLORS.ink);
  });
  const values = data.map((item, index) => radarPoint(index, data.length, item.value, cx, cy, radius));
  values.forEach((point, index) => {
    page.drawLine({ start: { x: point[0], y: point[1] }, end: { x: values[(index + 1) % values.length][0], y: values[(index + 1) % values.length][1] }, thickness: 1.7, color: PDF_COLORS.brand });
    page.drawCircle({ x: point[0], y: point[1], size: 2.2, color: PDF_COLORS.brand });
  });
}

function drawTrend(page: PDFPage, font: PDFFont, series: TrendSeries[], x: number, top: number, width: number, height: number): void {
  page.drawText('排名趋势', { x, y: top - 11, size: PROFILE_FONT_SIZES.section, font, color: PDF_COLORS.brandDark });
  const exams = series[0]?.points ?? [];
  const values = series.flatMap((item) => item.points.flatMap((point) => point.value == null ? [] : [point.value]));
  if (!values.length) {
    drawCenteredText(page, font, '暂无排名趋势', x, top - height / 2, width, PROFILE_FONT_SIZES.body, PDF_COLORS.muted);
    return;
  }
  series.forEach((item, index) => {
    const legendX = x + 72 + index * 66;
    const color = SERIES_COLORS[index % SERIES_COLORS.length];
    page.drawLine({ start: { x: legendX, y: top - 8 }, end: { x: legendX + 13, y: top - 8 }, thickness: 2, color });
    page.drawText(item.label, { x: legendX + 17, y: top - 11, size: 8, font, color });
  });
  const left = x + 35;
  const right = x + width - 20;
  const chartTop = top - 28;
  const chartBottom = top - height + 24;
  const chartWidth = right - left;
  const chartHeight = chartTop - chartBottom;
  const maximum = Math.max(...values, 2);
  const pointX = (index: number) => exams.length === 1 ? left + chartWidth / 2 : left + index * chartWidth / (exams.length - 1);
  const pointY = (rank: number) => chartTop - rankToY(rank, maximum, 0, chartHeight);
  [1, Math.round(maximum / 2), maximum].forEach((tick) => {
    const y = pointY(tick);
    page.drawLine({ start: { x: left, y }, end: { x: right, y }, thickness: .35, color: PDF_COLORS.line });
    page.drawText(String(tick), { x, y: y - 3, size: 8, font, color: PDF_COLORS.muted });
  });
  exams.forEach((exam, index) => drawCenteredText(page, font, exam.examName.slice(0, 7), pointX(index) - 28, chartBottom - 15, 56, 8, PDF_COLORS.muted));
  series.forEach((item, seriesIndex) => {
    const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
    splitTrendSegments(item.points.map((point, index) => ({ ...point, index }))).forEach((segment) => segment.slice(1).forEach((point, index) => {
      const previous = segment[index];
      page.drawLine({ start: { x: pointX(previous.index), y: pointY(previous.value!) }, end: { x: pointX(point.index), y: pointY(point.value!) }, thickness: item.metric === 'total' ? 1.8 : 1.4, color });
    }));
    item.points.forEach((point, index) => { if (point.value != null) page.drawCircle({ x: pointX(index), y: pointY(point.value), size: 2.3, color }); });
  });
}

function drawStudentCard(page: PDFPage, font: PDFFont, report: StudentProfileReport, x: number, top: number, width: number, height: number, index: number): void {
  page.drawRectangle({ x, y: top - height, width, height, color: index % 2 ? PDF_COLORS.normal : PDF_COLORS.white, borderColor: PDF_COLORS.line, borderWidth: .7 });
  page.drawRectangle({ x, y: top - height, width: 4, height, color: PDF_COLORS.brand });
  drawStudentHeader(page, font, report, x, top, width);
  page.drawLine({ start: { x: x + 13, y: top - 57 }, end: { x: x + width - 13, y: top - 57 }, thickness: .5, color: PDF_COLORS.line });
  const contentX = x + 14;
  const mainTop = top - 66;
  drawSubjectTable(page, font, report.subjects, contentX, mainTop, 304, 172);
  drawRadar(page, font, report.radar, contentX + 324, mainTop, width - 352, 172);
  drawTrend(page, font, report.trends, contentX, top - 243, width - 28, height - 252);
}

export function compactProfilePlan(project: ScoreLensProject, reports: StudentProfileReport[], density: ProfileDensity, font: PDFFont) {
  const width = A4.portrait[0] - 56;
  const lines = [project.projectName + ' · 学生画像', reports[0]?.examName ?? '',
    `排名差 ≤ -${project.settings.rankDifferenceThreshold} 为优势（绿），≥ ${project.settings.rankDifferenceThreshold} 为薄弱（橙）`,
    '雷达由内向外：C、C+、B、B+、A、A+；趋势缺失处断开。',
    ...profileLegend(reports[0]),
  ].flatMap(text => wrapPdfText(font, text, width, 9));
  const top = A4.portrait[1] - 34 - lines.length * 12;
  return { lines, top, pages: planProfilePages(reports, density, font, top - 30) };
}

let previewFont: Promise<PDFFont> | undefined;
export async function profilePageCount(project: ScoreLensProject, studentIds: string[], examId: string, metrics: TrendMetric[], density: ProfileDensity) {
  const reports = buildStudentProfileReports(project, studentIds, examId, metrics);
  if (!reports.length) return 0;
  if (density === 2) return paginateStudentProfiles(reports).length;
  const font = await (previewFont ??= createChinesePdf().then(result => result.font));
  return compactProfilePlan(project, reports, density, font).pages.length;
}

export async function createStudentProfilesPdfBytes(project: ScoreLensProject, studentIds: string[], examId: string, trendMetrics: TrendMetric[], onProgress?: (completed: number, total: number) => void, fontBytes?: Uint8Array, density: ProfileDensity = 2): Promise<Uint8Array> {
  const reports = buildStudentProfileReports(project, studentIds, examId, trendMetrics);
  if (!reports.length) throw new Error('请至少选择一名在读学生。');
  const { document, font } = await createChinesePdf(fontBytes);
  if (density !== 2) {
    const plan = compactProfilePlan(project, reports, density, font);
    let completed = 0;
    plan.pages.forEach((item, index) => {
      const page = document.addPage(A4.portrait);
      plan.lines.forEach((line, lineIndex) => {
        const series = /^趋势线(\d+)/.exec(line);
        const color = series ? PROFILE_TREND_COLORS[(Number(series[1]) - 1) % PROFILE_TREND_COLORS.length] : PDF_COLORS.ink;
        page.drawText(line, { x: 28, y: A4.portrait[1] - 28 - lineIndex * 12, size: 9, font, color });
      });
      let top = plan.top;
      item.reports.forEach((report, reportIndex) => {
        drawCompactProfile(page, font, report, 28, top, A4.portrait[0] - 56, item.heights[reportIndex]);
        top -= item.heights[reportIndex] + 8;
        if (!report.continuation) onProgress?.(++completed, reports.length);
      });
      page.drawText(`ScoreLens · ${density} 人/页上限 · 第 ${index + 1}/${plan.pages.length} 页`, { x: 28, y: 14, size: 8, font, color: PDF_COLORS.muted });
    });
    return document.save({ useObjectStreams: false });
  }
  const pages = paginateStudentProfiles(reports);
  let completed = 0;
  pages.forEach((items, pageIndex) => {
    const page = document.addPage(A4.portrait);
    const [width, height] = A4.portrait;
    const margin = 28;
    page.drawRectangle({ x: 0, y: height - 7, width, height: 7, color: PDF_COLORS.brand });
    page.drawText(`${project.projectName} · 学生画像`, { x: margin, y: height - 34, size: 16, font, color: PDF_COLORS.brandDark });
    page.drawText(`${items[0]?.examName ?? ''} · 标准排版 2 人/页 · 第 ${pageIndex + 1}/${pages.length} 页`, { x: margin, y: height - 51, size: 9, font, color: PDF_COLORS.muted });
    page.drawText(`排名差判定：≤ -${project.settings.rankDifferenceThreshold} 相对优势；≥ ${project.settings.rankDifferenceThreshold} 相对薄弱`, { x: width - 287, y: height - 33, size: 8, font, color: PDF_COLORS.muted });
    page.drawRectangle({ x: width - 287, y: height - 50, width: 10, height: 7, color: PDF_COLORS.advantage });
    page.drawText('相对优势', { x: width - 272, y: height - 50, size: 8, font, color: PDF_COLORS.advantageText });
    page.drawRectangle({ x: width - 211, y: height - 50, width: 10, height: 7, color: PDF_COLORS.weakness });
    page.drawText('相对薄弱', { x: width - 196, y: height - 50, size: 8, font, color: PDF_COLORS.weaknessText });
    const cardHeight = 349;
    let top = height - 68;
    items.forEach((report, index) => {
      drawStudentCard(page, font, report, margin, top, width - margin * 2, cardHeight, index);
      top -= cardHeight + 10;
      completed += 1;
      onProgress?.(completed, reports.length);
    });
    page.drawText('ScoreLens 本地生成 · 等级雷达仅使用有效等级 · 排名趋势使用项目内各考试真实排名', { x: margin, y: 12, size: 7.5, font, color: PDF_COLORS.muted });
  });
  return document.save({ useObjectStreams: false });
}

export async function exportStudentProfilesPdf(project: ScoreLensProject, studentIds: string[], examId: string, trendMetrics: TrendMetric[], onProgress?: (completed: number, total: number) => void, density: ProfileDensity = 2): Promise<void> {
  const bytes = await createStudentProfilesPdfBytes(project, studentIds, examId, trendMetrics, onProgress, undefined, density);
  const exam = project.exams.find((item) => item.examId === examId);
  downloadPdf(bytes, `${project.projectName}_${exam?.name ?? '学生画像'}_学生画像_${studentIds.length}人`);
}
