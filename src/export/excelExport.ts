import ExcelJS from 'exceljs';
import type { SubjectAnalysisRow } from '../analytics/subjectAnalysis';
import { downloadBlob, safeFileName } from './fileDownload';
import { formatRankChange, rankChangeTone } from '../format/rankChange';

const COLORS = {
  header: 'E7F3EE',
  headerText: '173E31',
  advantage: 'E1F3ED',
  advantageText: '146047',
  weakness: 'FFF0E8',
  weaknessText: 'A44928',
  progress: 'E1F3ED',
  progressText: '146047',
  decline: 'FFF4DC',
  declineText: '9A5A12',
  border: 'DCE5E0',
};

export function createSubjectAnalysisWorkbook(title: string, subjectName: string, rows: SubjectAnalysisRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ScoreLens';
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet('学科分析', { views: [{ state: 'frozen', ySplit: 2, xSplit: 2 }] });
  worksheet.mergeCells('A1:K1');
  worksheet.getCell('A1').value = title;
  worksheet.getCell('A1').font = { bold: true, size: 16, color: { argb: COLORS.headerText } };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
  worksheet.getRow(1).height = 30;
  const headers = ['学号', '姓名', '总分', '总排名', '总进退', '总等级', `${subjectName}成绩`, `${subjectName}等级`, `${subjectName}排名`, `${subjectName}进退`, '排名差'];
  worksheet.addRow(headers);
  const headerRow = worksheet.getRow(2);
  headerRow.font = { bold: true, color: { argb: COLORS.headerText } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.header } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  rows.forEach((item) => {
    const row = worksheet.addRow([
      item.student.studentId, item.student.name, item.total?.score ?? null, item.total?.gradeRank ?? null,
      formatRankChange(item.total?.sourceRankChange), item.total?.grade ?? null, item.subject?.score ?? null, item.subject?.grade ?? null,
      item.subject?.gradeRank ?? null, formatRankChange(item.subject?.sourceRankChange), item.difference,
    ]);
    row.getCell(1).numFmt = '@';
    for (const column of [5, 10]) {
      const value = column === 5 ? item.total?.sourceRankChange : item.subject?.sourceRankChange;
      const tone = rankChangeTone(value);
      if (tone === 'neutral') continue;
      row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone === 'progress' ? COLORS.progress : COLORS.decline } };
      row.getCell(column).font = { color: { argb: tone === 'progress' ? COLORS.progressText : COLORS.declineText }, bold: true };
    }
    if (item.status === 'advantage' || item.status === 'weakness') {
      const fill = item.status === 'advantage' ? COLORS.advantage : COLORS.weakness;
      const color = item.status === 'advantage' ? COLORS.advantageText : COLORS.weaknessText;
      for (const column of [7, 8, 9, 11]) {
        row.getCell(column).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        row.getCell(column).font = { color: { argb: color }, bold: column === 11 };
      }
    }
  });
  worksheet.columns = [16, 12, 11, 11, 12, 11, 13, 13, 13, 12, 11].map((width) => ({ width }));
  worksheet.eachRow((row) => row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } };
    cell.alignment = { ...cell.alignment, vertical: 'middle' };
  }));
  worksheet.autoFilter = { from: 'A2', to: 'K2' };
  return workbook;
}

export async function exportSubjectAnalysisXlsx(title: string, examName: string, subjectName: string, rows: SubjectAnalysisRow[]): Promise<void> {
  const workbook = createSubjectAnalysisWorkbook(title, subjectName, rows);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeFileName(examName)}_${safeFileName(subjectName)}学科分析.xlsx`);
}
