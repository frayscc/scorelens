import type { SubjectAnalysisRow } from '../analytics/subjectAnalysis';
import { A4, createChinesePdf, downloadPdf, drawCenteredText, PDF_COLORS } from './pdfCore';
import { wrapPdfText } from './profileLayout';
import { formatRankChange, rankChangeTone } from '../format/rankChange';

export function paginateAnalysisRows<T>(rows: T[]): T[][] { return [rows]; }
const show = (value: unknown) => value == null || value === '' ? '—' : String(value);

export async function createSubjectAnalysisPdfBytes(title: string, subjectName: string, threshold: number, rows: SubjectAnalysisRow[], fontBytes?: Uint8Array): Promise<Uint8Array> {
  const { document, font } = await createChinesePdf(fontBytes);
  const page = document.addPage(A4.portrait);
  const [width, height] = A4.portrait;
  const margin = 24;
  const contentWidth = width - margin * 2;
  let cursor = height - 30;
  for (const line of wrapPdfText(font, title, contentWidth, 14)) {
    page.drawText(line, { x: margin, y: cursor, size: 14, font, color: PDF_COLORS.brandDark });
    cursor -= 18;
  }

  const counts = { advantage: 0, weakness: 0, normal: 0, unavailable: 0 };
  rows.forEach(row => { counts[row.status] += 1; });
  const summary = `共 ${rows.length} 人 · 优势 ${counts.advantage} · 薄弱 ${counts.weakness} · 正常 ${counts.normal} · 无排名差 ${counts.unavailable} · 总排名升序`;
  const notes = [
    summary,
    `D = 学科排名 - 总排名；D ≤ -${threshold} 优势（绿），D ≥ ${threshold} 薄弱（橙），其余正常。`,
    '进退来自学校成绩表：↑ 进步，↓ 退步；缺失数据以 — 显示。',
  ];
  for (const note of notes) {
    for (const line of wrapPdfText(font, note, contentWidth, 8.5)) {
      page.drawText(line, { x: margin, y: cursor, size: 8.5, font, color: PDF_COLORS.muted });
      cursor -= 12;
    }
  }

  const headers = ['姓名', '总分', '总排名', '总进退', '总等级', '学科分数', '学科等级', '学科排名', '学科进退', '排名差'];
  const weights = [1.4, .8, .9, 1, .8, 1, .9, 1, 1, .9];
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const widths = weights.map(value => contentWidth * value / weightTotal);
  const tableTop = cursor - 2;
  const rowHeight = Math.min(18, (tableTop - 28) / (rows.length + 1));
  const fontSize = Math.min(9, rowHeight * .68);
  const tableBottom = tableTop - rowHeight * (rows.length + 1);

  page.drawRectangle({ x: margin, y: tableTop - rowHeight, width: contentWidth, height: rowHeight, color: PDF_COLORS.brandSoft });
  let cellX = margin;
  headers.forEach((label, index) => {
    drawCenteredText(page, font, label, cellX, tableTop - rowHeight + (rowHeight - fontSize) / 2 + 1, widths[index], fontSize, PDF_COLORS.brandDark);
    cellX += widths[index];
  });
  rows.forEach((item, rowIndex) => {
    const y = tableTop - rowHeight * (rowIndex + 2);
    if (rowIndex % 2) page.drawRectangle({ x: margin, y, width: contentWidth, height: rowHeight, color: PDF_COLORS.normal });
    const values = [
      item.student.name, item.total?.score, item.total?.gradeRank,
      formatRankChange(item.total?.sourceRankChange), item.total?.grade,
      item.subject?.score, item.subject?.grade, item.subject?.gradeRank,
      formatRankChange(item.subject?.sourceRankChange),
      item.difference == null ? null : item.difference > 0 ? `+${item.difference}` : item.difference,
    ];
    let x = margin;
    values.forEach((value, index) => {
      let color = PDF_COLORS.ink;
      const classified = [5, 6, 7, 9].includes(index);
      if (classified && item.status === 'advantage') {
        page.drawRectangle({ x, y, width: widths[index], height: rowHeight, color: PDF_COLORS.advantage });
        color = PDF_COLORS.advantageText;
      }
      if (classified && item.status === 'weakness') {
        page.drawRectangle({ x, y, width: widths[index], height: rowHeight, color: PDF_COLORS.weakness });
        color = PDF_COLORS.weaknessText;
      }
      const change = index === 3 ? item.total?.sourceRankChange : index === 8 ? item.subject?.sourceRankChange : null;
      const tone = rankChangeTone(change);
      if (tone !== 'neutral') {
        page.drawRectangle({ x, y, width: widths[index], height: rowHeight, color: tone === 'progress' ? PDF_COLORS.progress : PDF_COLORS.decline });
        color = tone === 'progress' ? PDF_COLORS.progressText : PDF_COLORS.declineText;
      }
      drawCenteredText(page, font, show(value), x, y + (rowHeight - fontSize) / 2 + 1, widths[index], fontSize, color);
      x += widths[index];
    });
    page.drawLine({ start: { x: margin, y }, end: { x: margin + contentWidth, y }, thickness: .3, color: PDF_COLORS.line });
  });
  let gridX = margin;
  for (const columnWidth of [...widths, 0]) {
    page.drawLine({ start: { x: gridX, y: tableBottom }, end: { x: gridX, y: tableTop }, thickness: .25, color: PDF_COLORS.line });
    gridX += columnWidth;
  }
  page.drawText(`ScoreLens · ${subjectName}学科分析`, { x: margin, y: 13, size: 7, font, color: PDF_COLORS.muted });
  return document.save({ useObjectStreams: false });
}

export async function exportSubjectAnalysisPdf(title: string, examName: string, subjectName: string, threshold: number, rows: SubjectAnalysisRow[]): Promise<void> {
  downloadPdf(await createSubjectAnalysisPdfBytes(title, subjectName, threshold, rows), `${examName}_${subjectName}学科分析`);
}
