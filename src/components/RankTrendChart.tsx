import type { TrendSeries } from '../analytics/trend';
import { rankToY, splitTrendSegments } from '../analytics/trend';

const COLORS = ['#126b4f', '#c56b3f', '#3569a8', '#8b5aa5', '#a08128', '#21858c', '#bd4262', '#596b2f', '#4b5f9a', '#8b6351', '#2f7c56'];

export function RankTrendChart({ series }: { series: TrendSeries[] }) {
  if (!series.length) return <div className="trend-empty"><strong>请选择趋势指标</strong><p>勾选总排名或至少一门学科后即可查看趋势。</p></div>;
  const exams = series[0]?.points ?? [];
  const values = series.flatMap((item) => item.points.flatMap((point) => point.value == null ? [] : [point.value]));
  if (!exams.length) return <div className="trend-empty"><strong>暂无考试</strong><p>导入至少一场包含年级排名的考试后即可查看趋势。</p></div>;
  if (!values.length) return <div className="trend-empty"><strong>暂无排名数据</strong><p>所选学生在这些考试中没有可用的年级排名。</p></div>;
  const maxRank = Math.max(...values, 2);
  const width = 920; const height = 390; const left = 66; const right = 28; const top = 26; const bottom = 92;
  const plotWidth = width - left - right; const plotHeight = height - top - bottom;
  const x = (index: number) => exams.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (exams.length - 1);
  const y = (rank: number) => rankToY(rank, maxRank, top, plotHeight);
  const ticks = [...new Set([1, ...Array.from({length:4},(_,index)=>Math.max(1,Math.round(1+(maxRank-1)*(index+1)/4)))])];
  return <div className="trend-chart"><div className="trend-legend">{series.map((item,index)=><span key={item.metric}><i style={{background:COLORS[index%COLORS.length]}}/>{item.label}</span>)}</div><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="年级排名趋势图">
    {ticks.map((tick)=><g key={tick}><line className="trend-grid" x1={left} x2={width-right} y1={y(tick)} y2={y(tick)}/><text className="trend-y-label" x={left-12} y={y(tick)+4} textAnchor="end">{tick}</text></g>)}
    <text className="trend-axis-note" x="12" y="18">排名（越高越好）</text>
    {exams.map((exam,index)=><g key={exam.examId}><line className="trend-x-tick" x1={x(index)} x2={x(index)} y1={top+plotHeight} y2={top+plotHeight+5}/><text className="trend-x-label" transform={`translate(${x(index)-3} ${top+plotHeight+18}) rotate(28)`}>{exam.examName}</text></g>)}
    {series.map((item,seriesIndex)=>{const color=COLORS[seriesIndex%COLORS.length];return <g key={item.metric}>{splitTrendSegments(item.points.map((point,index)=>({...point,index}))).map((segment,index)=><polyline key={index} fill="none" stroke={color} strokeWidth={item.metric==='total'?3:2.2} strokeLinecap="round" strokeLinejoin="round" points={segment.map((point)=>`${x(point.index)},${y(point.value!)}`).join(' ')}/>)}{item.points.map((point,index)=>point.value==null?null:<g key={point.examId}><circle cx={x(index)} cy={y(point.value)} r={item.metric==='total'?4.5:3.5} fill="#fff" stroke={color} strokeWidth="2.5"/><title>{item.label} · {point.examName} · 第{point.value}名</title></g>)}</g>;})}
  </svg><p className="trend-footnote">折线上升表示排名进步；缺失成绩处不补 0、不连接。</p></div>;
}
