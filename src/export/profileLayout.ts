import { rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { StudentProfileReport } from './studentProfilePdf';
import { splitTrendSegments } from '../analytics/trend';
import { PDF_COLORS as C } from './pdfCore';

export type ProfileDensity = 2 | 3 | 4;
export const PROFILE_TREND_COLORS = [C.brand, rgb(.77, .42, .25), rgb(.21, .41, .66), rgb(.55, .35, .65), rgb(.63, .51, .16), rgb(.13, .52, .55), rgb(.74, .26, .39), rgb(.35, .42, .18), rgb(.29, .37, .60), rgb(.54, .39, .32), rgb(.18, .49, .34)];
const show = (value: unknown) => value == null ? '—' : String(value);

export function wrapPdfText(font: PDFFont, text: string, width: number, size: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    if (line && font.widthOfTextAtSize(line + character, size) > width) { lines.push(line); line = ''; }
    line += character;
  }
  return [...lines, line];
}
function tableHeight(report: StudentProfileReport, font: PDFFont) {
  return 15 + report.subjects.reduce((sum, row) => sum + Math.max(13, wrapPdfText(font, row.subject.name, 62, 8.5).length * 10 + 3), 0);
}
function wideTrend(report: StudentProfileReport) {
  return (report.trends[0]?.points.length ?? 0) > 7 || report.trends.length > 3 || report.radar.length > 10 || report.radar.some(item => item.subjectName.length > 4);
}
export function planProfilePages(reports: StudentProfileReport[], density: ProfileDensity, font: PDFFont, available: number) {
  const sections = reports.flatMap(report => {
    const headerHeight = Math.max(30, wrapPdfText(font, report.student.name + ' · ' + report.student.studentId, 225, 11).length * 13 + 8);
    const capacity = available - headerHeight - (wideTrend(report) ? 105 : 0) - 8;
    const parts: StudentProfileReport[] = [];
    let rows: StudentProfileReport['subjects'] = [];
    for (const row of report.subjects) {
      if (rows.length && tableHeight({ ...report, subjects: [...rows, row] }, font) > capacity) {
        parts.push({ ...report, subjects: rows, continuation: parts.length || undefined }); rows = [];
      }
      rows.push(row);
    }
    parts.push({ ...report, subjects: rows, continuation: parts.length || undefined });
    return parts;
  });
  const pages: { reports: StudentProfileReport[]; heights: number[] }[] = [];
  let current = { reports: [] as StudentProfileReport[], heights: [] as number[] };
  for (const report of sections) {
    const headerHeight = Math.max(30, wrapPdfText(font, report.student.name + ' · ' + report.student.studentId, 225, 11).length * 13 + 8);
    const minimum = headerHeight + Math.max(tableHeight(report, font), 120) + (wideTrend(report) ? 105 : 0) + 8;
    const target = Math.max((available - (density - 1) * 8) / density, minimum);
    const used = current.heights.reduce((sum, height) => sum + height + 8, 0);
    if (current.reports.length && (current.reports.length >= density || used + target > available + .01)) {
      pages.push(current); current = { reports: [], heights: [] };
    }
    current.reports.push(report); current.heights.push(target);
  }
  if (current.reports.length) pages.push(current);
  return pages;
}
export function profileLegend(report: StudentProfileReport) {
  const exams = (report.trends[0]?.points ?? []).map((point, index) => `E${index + 1} ${point.examName}`).join('；');
  return [...report.trends.map((series, index) => `趋势线${index + 1}：${series.label}`), exams];
}
export function drawCompactProfile(page: PDFPage, font: PDFFont, report: StudentProfileReport, x: number, top: number, width: number, height: number) {
  page.drawLine({ start: { x, y: top }, end: { x: x + width, y: top }, thickness: .7, color: C.line });
  const identity = wrapPdfText(font, report.student.name + ' · ' + report.student.studentId, 225, 11);
  identity.forEach((line, index) => page.drawText(line, { x, y: top - 16 - index * 13, size: 11, font, color: C.brandDark }));
  if (report.continuation) page.drawText(`续 ${report.continuation + 1}`, { x: x + width - 30, y: top - 27, size: 8, font, color: C.muted });
  const summary = `总分 ${show(report.totalScore)}  总排名 ${show(report.totalRank)}  总等级 ${show(report.totalGrade)}`;
  wrapPdfText(font, summary, width - 240, 9).forEach((line, index) => page.drawText(line, { x: x + 240, y: top - 15 - index * 11, size: 9, font, color: C.ink }));
  const bodyTop = top - Math.max(30, identity.length * 13 + 8);
  const tableWidth = wideTrend(report) ? 300 : 245;
  const columns = [68, 43, 39, 46, tableWidth - 196];
  const labels = ['学科', '分数', '等级', '排名', '排名差'];
  let columnX = x;
  page.drawRectangle({ x, y: bodyTop - 15, width: tableWidth, height: 15, color: C.brandSoft });
  labels.forEach((label, index) => {
    page.drawText(label, { x: columnX + 3, y: bodyTop - 11, font, size: 8.5, color: C.brandDark }); columnX += columns[index];
  });
  let rowTop = bodyTop - 15;
  for (const row of report.subjects) {
    const names = wrapPdfText(font, row.subject.name, 62, 8.5);
    const rowHeight = Math.max(13, names.length * 10 + 3);
    const background = row.status === 'advantage' ? C.advantage : row.status === 'weakness' ? C.weakness : C.white;
    page.drawRectangle({ x: x + columns[0], y: rowTop - rowHeight, width: tableWidth - columns[0], height: rowHeight, color: background });
    names.forEach((line, index) => page.drawText(line, { x: x + 3, y: rowTop - 10 - index * 10, font, size: 8.5, color: C.ink }));
    const values = [row.metrics.score, row.metrics.grade, row.metrics.gradeRank, row.difference];
    let cellX = x + columns[0];
    values.forEach((value, index) => {
      page.drawText(show(value), { x: cellX + 3, y: rowTop - 10, font, size: 8.5, color: C.ink }); cellX += columns[index + 1];
    });
    rowTop -= rowHeight;
    page.drawLine({ start: { x, y: rowTop }, end: { x: x + tableWidth, y: rowTop }, thickness: .25, color: C.line });
  }
  const contentHeight = height - (top - bodyTop) - 8;
  if (wideTrend(report)) {
    drawRadar(page, font, report, x + 316, bodyTop, width - 316, contentHeight - 105);
    drawTrend(page, font, report, x, top - height + 100, width, 96);
  } else {
    drawRadar(page, font, report, x + 257, bodyTop, 126, contentHeight);
    drawTrend(page, font, report, x + 394, bodyTop, width - 394, contentHeight);
  }
}
function drawRadar(page: PDFPage, font: PDFFont, report: StudentProfileReport, x: number, top: number, width: number, height: number) {
  page.drawText('等级雷达', { x, y: top - 10, size: 9, font, color: C.brandDark });
  if (report.radar.length < 3) { page.drawText('等级数据不足', { x, y: top - 35, size: 8, font, color: C.muted }); return; }
  const cx = x + width / 2, cy = top - height / 2 - 5;
  const radius = Math.max(15, Math.min((width - 52) / 2, (height - 58) / 2));
  const point = (index: number, value: number) => {
    const angle = Math.PI / 2 - index * Math.PI * 2 / report.radar.length;
    return { x: cx + Math.cos(angle) * radius * value / 6, y: cy + Math.sin(angle) * radius * value / 6 };
  };
  for (let ring = 1; ring <= 6; ring++) {
    report.radar.forEach((_, index) => page.drawLine({ start: point(index, ring), end: point((index + 1) % report.radar.length, ring), thickness: .3, color: C.line }));
  }
  report.radar.forEach((row, index) => {
    const label = point(index, 8.5);
    const text = row.subjectName;
    page.drawText(text, { x: label.x - font.widthOfTextAtSize(text, 8) / 2, y: label.y - 3, size: 8, font, color: C.ink });
    page.drawLine({ start: point(index, row.value), end: point((index + 1) % report.radar.length, report.radar[(index + 1) % report.radar.length].value), thickness: 1.3, color: C.brand });
  });
}
function drawTrend(page: PDFPage, font: PDFFont, report: StudentProfileReport, x: number, top: number, width: number, height: number) {
  page.drawText('排名趋势', { x, y: top - 10, size: 9, font, color: C.brandDark });
  const exams = report.trends[0]?.points ?? [];
  const values = report.trends.flatMap(series => series.points.flatMap(point => point.value == null ? [] : [point.value]));
  if (!values.length) { page.drawText('暂无排名', { x, y: top - 35, size: 8, font, color: C.muted }); return; }
  const maximum = Math.max(...values, 2), left = x + 25, right = x + width - 10, bottom = top - height + 18;
  const chartTop = top - 26;
  const px = (index: number) => exams.length <= 1 ? (left + right) / 2 : left + index * (right - left) / (exams.length - 1);
  const py = (rank: number) => chartTop - (rank - 1) / (maximum - 1) * (chartTop - bottom);
  for (const tick of [1, maximum]) {
    page.drawText(String(tick), { x, y: py(tick) - 3, font, size: 8, color: C.muted });
    page.drawLine({ start: { x: left, y: py(tick) }, end: { x: right, y: py(tick) }, thickness: .3, color: C.line });
  }
  const tickStep = Math.max(1, Math.ceil(exams.length / Math.max(2, Math.floor((right - left) / 24))));
  exams.forEach((_, index) => {
    if (index % tickStep === 0 || index === exams.length - 1) page.drawText('E' + (index + 1), { x: px(index) - 6, y: bottom - 13, size: 8, font, color: C.muted });
  });
  report.trends.forEach((series, seriesIndex) => {
    const color = PROFILE_TREND_COLORS[seriesIndex % PROFILE_TREND_COLORS.length];
    splitTrendSegments(series.points.map((point, index) => ({ ...point, index }))).forEach(segment => segment.slice(1).forEach((point, index) => {
      const previous = segment[index]; page.drawLine({ start: { x: px(previous.index), y: py(previous.value!) }, end: { x: px(point.index), y: py(point.value!) }, thickness: 1.3, color });
    }));
    series.points.forEach((point, index) => { if (point.value != null) page.drawCircle({ x: px(index), y: py(point.value), size: 1.8, color }); });
  });
}
