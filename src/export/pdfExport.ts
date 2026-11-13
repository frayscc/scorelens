import type { SubjectAnalysisRow } from '../analytics/subjectAnalysis';
import { A4, createChinesePdf, downloadPdf, drawCenteredText, fitText, PDF_COLORS } from './pdfCore';
import { formatRankChange, rankChangeTone } from '../format/rankChange';

export function paginateAnalysisRows<T>(rows: T[]): T[][] { return [rows]; }
const show = (value: unknown) => value == null || value === '' ? '—' : String(value);

export async function createSubjectAnalysisPdfBytes(title: string, subjectName: string, threshold: number, rows: SubjectAnalysisRow[], fontBytes?: Uint8Array): Promise<Uint8Array> {
  const { document, font } = await createChinesePdf(fontBytes);
  const page = document.addPage(A4.portrait); const [width, height] = A4.portrait; const margin = 28; const contentWidth = width - margin * 2;
  page.drawRectangle({ x: 0, y: height - 8, width, height: 8, color: PDF_COLORS.brand });
  page.drawText('SCORELENS · STUDENT PERFORMANCE ANALYTICS', { x: margin, y: height - 34, size: 6.8, font, color: PDF_COLORS.brand });
  const titleSize = fitText(font, title, contentWidth, 18, 12);
  page.drawText(title, { x: margin, y: height - 58, size: titleSize, font, color: PDF_COLORS.brandDark });
  page.drawText(`按总排名升序 · 共 ${rows.length} 名学生 · 阈值 T = ${threshold}`, { x: margin, y: height - 76, size: 7.5, font, color: PDF_COLORS.muted });

  const counts = { advantage: 0, weakness: 0, normal: 0, unavailable: 0 };
  rows.forEach((row) => { counts[row.status] += 1; });
  const cards = [
    ['全部学生', rows.length, PDF_COLORS.brandSoft, PDF_COLORS.brandDark],
    ['相对优势', counts.advantage, PDF_COLORS.advantage, PDF_COLORS.advantageText],
    ['相对薄弱', counts.weakness, PDF_COLORS.weakness, PDF_COLORS.weaknessText],
    ['正常范围', counts.normal, PDF_COLORS.normal, PDF_COLORS.ink],
  ] as const;
  const cardGap = 7; const cardWidth = (contentWidth - cardGap * 3) / 4;
  cards.forEach(([label,value,background,color],index) => { const x=margin+index*(cardWidth+cardGap);page.drawRectangle({x,y:height-120,width:cardWidth,height:32,color:background});page.drawText(label,{x:x+9,y:height-101,size:6.8,font,color:PDF_COLORS.muted});page.drawText(String(value),{x:x+9,y:height-115,size:12,font,color}); });

  page.drawRectangle({ x: margin, y: height - 183, width: contentWidth, height: 53, color: PDF_COLORS.normal, borderColor: PDF_COLORS.line, borderWidth: .6 });
  page.drawText('判定说明', { x: margin + 9, y: height - 144, size: 7.2, font, color: PDF_COLORS.brandDark });
  page.drawText(`D = ${subjectName}年级排名 - 总分年级排名`, { x: margin + 67, y: height - 144, size: 6.8, font, color: PDF_COLORS.ink });
  page.drawText(`D ≤ -${threshold}：相对优势`, { x: margin + 246, y: height - 144, size: 6.8, font, color: PDF_COLORS.advantageText });
  page.drawText(`D ≥ ${threshold}：相对薄弱`, { x: margin + 365, y: height - 144, size: 6.8, font, color: PDF_COLORS.weaknessText });
  page.drawText(`-${threshold} < D < ${threshold}：正常`, { x: margin + 67, y: height - 157, size: 6.2, font, color: PDF_COLORS.muted });
  page.drawRectangle({x:margin+246,y:height-159,width:9,height:7,color:PDF_COLORS.advantage});page.drawText('绿色：学科表现领先于整体',{x:margin+260,y:height-158,size:5.8,font,color:PDF_COLORS.muted});
  page.drawRectangle({x:margin+365,y:height-159,width:9,height:7,color:PDF_COLORS.weakness});page.drawText('橙色：学科表现落后于整体',{x:margin+379,y:height-158,size:5.8,font,color:PDF_COLORS.muted});
  page.drawText('级次进退步：↑ 表示学校成绩表记录的级次进步；↓ 表示学校成绩表记录的级次退步', { x: margin + 67, y: height - 173, size: 6.1, font, color: PDF_COLORS.ink });
  page.drawRectangle({x:margin+401,y:height-177,width:9,height:7,color:PDF_COLORS.progress});page.drawText('绿色：进步',{x:margin+415,y:height-176,size:5.8,font,color:PDF_COLORS.progressText});
  page.drawRectangle({x:margin+470,y:height-177,width:9,height:7,color:PDF_COLORS.decline});page.drawText('浅橙：退步',{x:margin+484,y:height-176,size:5.8,font,color:PDF_COLORS.declineText});

  const headers = ['姓名','总分','总排名','总进退','总等级',`${subjectName}成绩`,`${subjectName}等级`,`${subjectName}排名`,`${subjectName}进退`,'排名差'];
  const columnWeights = [1.2,.8,.82,1,.72,.9,.82,.88,1,.78]; const weightTotal=columnWeights.reduce((a,b)=>a+b,0); const columnWidths=columnWeights.map((weight)=>contentWidth*weight/weightTotal);
  const tableTop = height - 196; const tableBottom = 30; const availableHeight = tableTop - tableBottom; const rowHeight = Math.min(13.5, availableHeight / Math.max(1, rows.length + 1)); const fontSize = Math.max(3.2, Math.min(6.8, rowHeight * .51));
  let x=margin;page.drawRectangle({x:margin,y:tableTop-rowHeight,width:contentWidth,height:rowHeight,color:PDF_COLORS.brandSoft});headers.forEach((label,index)=>{drawCenteredText(page,font,label,x,tableTop-rowHeight+Math.max(1.5,(rowHeight-fontSize)/2),columnWidths[index],fontSize+.15,PDF_COLORS.brandDark);x+=columnWidths[index];});
  rows.forEach((item,rowIndex)=>{const y=tableTop-rowHeight*(rowIndex+2);if(rowIndex%2)page.drawRectangle({x:margin,y,width:contentWidth,height:rowHeight,color:PDF_COLORS.normal});const values=[item.student.name,item.total?.score,item.total?.gradeRank,formatRankChange(item.total?.sourceRankChange),item.total?.grade,item.subject?.score,item.subject?.grade,item.subject?.gradeRank,formatRankChange(item.subject?.sourceRankChange),item.difference==null?null:item.difference>0?`+${item.difference}`:item.difference];let cellX=margin;values.forEach((value,index)=>{const isStatusColumn=[5,6,7,9].includes(index);if(isStatusColumn&&item.status==='advantage')page.drawRectangle({x:cellX,y,width:columnWidths[index],height:rowHeight,color:PDF_COLORS.advantage});if(isStatusColumn&&item.status==='weakness')page.drawRectangle({x:cellX,y,width:columnWidths[index],height:rowHeight,color:PDF_COLORS.weakness});const change=index===3?item.total?.sourceRankChange:index===8?item.subject?.sourceRankChange:null;const tone=rankChangeTone(change);if((index===3||index===8)&&tone!=='neutral')page.drawRectangle({x:cellX,y,width:columnWidths[index],height:rowHeight,color:tone==='progress'?PDF_COLORS.progress:PDF_COLORS.decline});const color=(index===3||index===8)&&tone!=='neutral'?(tone==='progress'?PDF_COLORS.progressText:PDF_COLORS.declineText):isStatusColumn&&item.status==='advantage'?PDF_COLORS.advantageText:isStatusColumn&&item.status==='weakness'?PDF_COLORS.weaknessText:PDF_COLORS.ink;drawCenteredText(page,font,show(value),cellX,y+Math.max(1.2,(rowHeight-fontSize)/2),columnWidths[index],fontSize,color);cellX+=columnWidths[index];});page.drawLine({start:{x:margin,y},end:{x:margin+contentWidth,y},thickness:.28,color:PDF_COLORS.line});});
  let gridX=margin;columnWidths.forEach((columnWidth)=>{page.drawLine({start:{x:gridX,y:tableBottom},end:{x:gridX,y:tableTop},thickness:.25,color:PDF_COLORS.line});gridX+=columnWidth;});page.drawLine({start:{x:margin+contentWidth,y:tableBottom},end:{x:margin+contentWidth,y:tableTop},thickness:.25,color:PDF_COLORS.line});
  page.drawText('ScoreLens 本地生成 · 级次进退步原样来自学校成绩表 · 趋势与排名差独立计算', { x: margin, y: 16, size: 5.5, font, color: PDF_COLORS.muted });
  return document.save({ useObjectStreams: false });
}

export async function exportSubjectAnalysisPdf(title: string, examName: string, subjectName: string, threshold: number, rows: SubjectAnalysisRow[]): Promise<void> {
  downloadPdf(await createSubjectAnalysisPdfBytes(title,subjectName,threshold,rows), `${examName}_${subjectName}学科分析`);
}
