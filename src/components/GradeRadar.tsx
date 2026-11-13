import { GRADE_ORDER } from '../constants';
import type { RadarDatum } from '../analytics/studentProfile';

interface Point { x: number; y: number; }

function point(index: number, count: number, radius: number, centerX = 250, centerY = 205): Point {
  const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
  return { x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius };
}

function points(value: number, count: number): string {
  return Array.from({ length: count }, (_, index) => {
    const item = point(index, count, 142 * value / 6);
    return `${item.x},${item.y}`;
  }).join(' ');
}

export function GradeRadar({ data }: { data: RadarDatum[] }) {
  if (data.length < 3) return <div className="radar-unavailable"><strong>等级数据不足</strong><p>至少需要 3 门有等级的学科才能绘制雷达图；缺失等级不会按 C 补齐。</p></div>;
  return <div className="radar-chart"><svg viewBox="0 0 520 430" role="img" aria-label="学科等级雷达图">
    {GRADE_ORDER.map((grade, ring) => <g key={grade}><polygon className="radar-ring" points={points(ring + 1, data.length)}/><text className="ring-label" x={258} y={205 - 142 * (ring + 1) / 6 + 4}>{grade}</text></g>)}
    {data.map((item, index) => { const outer=point(index,data.length,142); const label=point(index,data.length,178); return <g key={item.subjectId}><line className="radar-axis" x1="250" y1="205" x2={outer.x} y2={outer.y}/><text className="axis-label" textAnchor={label.x < 230 ? 'end' : label.x > 270 ? 'start' : 'middle'} x={label.x} y={label.y}><tspan>{item.subjectName}</tspan><tspan className="axis-grade" x={label.x} dy="15">{item.grade}</tspan></text></g>; })}
    <polygon className="radar-area" points={data.map((item,index)=>{const p=point(index,data.length,142*item.value/6);return `${p.x},${p.y}`;}).join(' ')}/>
    {data.map((item,index)=>{const p=point(index,data.length,142*item.value/6);return <circle className="radar-dot" key={item.subjectId} cx={p.x} cy={p.y} r="4"/>;})}
  </svg><div className="radar-scale">雷达层级：{GRADE_ORDER.join(' · ')}</div></div>;
}
