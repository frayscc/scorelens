import { describe, expect, it } from 'vitest';
import { buildStudentProfileReports, createStudentProfilesPdfBytes, paginateStudentProfiles, PROFILE_FONT_SIZES, STUDENTS_PER_PROFILE_PAGE } from '../src/export/studentProfilePdf';
import { createProject } from '../src/models/factory';
import type { Exam, Student } from '../src/models/project';
import { PDFDocument } from 'pdf-lib';
import { readFileSync } from 'node:fs';

function fixture() {
  const project=createProject('初三15班');
  const students:Student[]=[
    {studentId:'001',name:'张三',status:'active',createdAt:'now'},
    {studentId:'002',name:'李四',status:'active',createdAt:'now'},
    {studentId:'003',name:'王五',status:'inactive',createdAt:'now'},
  ];
  const first:Exam={examId:'first',name:'期中',order:0,source:{},createdAt:'now',updatedAt:'now',capabilities:{canViewScores:true,canAnalyzeRankDifference:true,canRenderRadar:true,canAnalyzeTotalRankTrend:true},students:{
    '001':{studentId:'001',total:{score:600,gradeRank:200,grade:'A'},subjects:{math:{score:110,gradeRank:150,grade:'A'},english:{score:100,gradeRank:250,grade:'B+'},chinese:{score:98,gradeRank:210,grade:'A'}}},
    '002':{studentId:'002',total:{score:580,gradeRank:300,grade:'B+'},subjects:{math:{score:90,gradeRank:350,grade:null}}},
    '003':{studentId:'003',total:{score:700,gradeRank:1,grade:'A+'},subjects:{math:{score:140,gradeRank:1,grade:'A+'}}},
  }};
  const second:Exam={...first,examId:'second',name:'期末',order:1,students:{
    '001':{studentId:'001',total:{score:620,gradeRank:160,grade:'A'},subjects:{math:{score:118,gradeRank:100,grade:'A+'}}},
  }};
  project.students=students;project.exams=[first,second];return project;
}

describe('multi-student profile reports',()=>{
  it('creates one complete report for each selected active student',()=>{
    const reports=buildStudentProfileReports(fixture(),['001','002','003'],'first',['total','math']);
    expect(reports).toHaveLength(2);
    expect(reports.map((report)=>report.student.name)).toEqual(['张三','李四']);
    expect(reports[0]).toMatchObject({examName:'期中',totalScore:600,totalRank:200,totalGrade:'A'});
    expect(reports[0].subjects).toHaveLength(3);
    expect(reports[0].radar).toHaveLength(3);
  });

  it('uses the same requested trend configuration for every student',()=>{
    const reports=buildStudentProfileReports(fixture(),['001','002'],'first',['total','math']);
    expect(reports.every((report)=>report.trends.map((series)=>series.metric).join(',')==='total,math')).toBe(true);
    expect(reports[0].trends[0].points.map((point)=>point.value)).toEqual([200,160]);
    expect(reports[1].trends[0].points.map((point)=>point.value)).toEqual([300,null]);
  });

  it('defaults PDF trend configuration to total rank when none is checked',()=>{
    const reports=buildStudentProfileReports(fixture(),['001'],'first',[]);
    expect(reports[0].trends.map((series)=>series.metric)).toEqual(['total']);
  });

  it('keeps a selected active student even when the current exam has no record',()=>{
    const reports=buildStudentProfileReports(fixture(),['002'],'second',['total']);
    expect(reports).toHaveLength(1);
    expect(reports[0].totalScore).toBeNull();
    expect(reports[0].subjects).toEqual([]);
  });

  it('uses readable standard pagination with at most two students per page',()=>{
    expect(STUDENTS_PER_PROFILE_PAGE).toBe(2);
    expect(paginateStudentProfiles(Array.from({length:2},(_,index)=>index)).map((page)=>page.length)).toEqual([2]);
    expect(paginateStudentProfiles(Array.from({length:3},(_,index)=>index)).map((page)=>page.length)).toEqual([2,1]);
    expect(paginateStudentProfiles(Array.from({length:5},(_,index)=>index)).map((page)=>page.length)).toEqual([2,2,1]);
    expect(paginateStudentProfiles(Array.from({length:10},(_,index)=>index)).map((page)=>page.length)).toEqual([2,2,2,2,2]);
    expect(PROFILE_FONT_SIZES.body).toBeGreaterThanOrEqual(9);
    expect(PROFILE_FONT_SIZES.table).toBeGreaterThanOrEqual(8);
  });

  it('generates vector PDF pages without a screenshot renderer',async()=>{
    const project=fixture();
    const font=readFileSync('node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf');
    const bytes=await createStudentProfilesPdfBytes(project,['001','002'],'first',['total','math'],undefined,font);
    expect(new TextDecoder().decode(bytes.slice(0,4))).toBe('%PDF');
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('keeps 2, 3, 5 and 10 student PDFs on the two-per-page strategy', async () => {
    const project=fixture();
    const first=project.exams[0];
    const template=first.students['001'];
    for(let index=3;index<=10;index+=1){
      const studentId=String(index).padStart(3,'0');
      const existing=project.students.find((student)=>student.studentId===studentId);
      if(existing) existing.status='active';
      else project.students.push({studentId,name:`学生${index}`,status:'active',createdAt:'now'});
      first.students[studentId]={...structuredClone(template),studentId};
    }
    const font=readFileSync('node_modules/@expo-google-fonts/noto-sans-sc/400Regular/NotoSansSC_400Regular.ttf');
    for(const [count,pages] of [[2,1],[3,2],[5,3],[10,5]] as const){
      const ids=project.students.filter((student)=>student.status==='active').slice(0,count).map((student)=>student.studentId);
      const bytes=await createStudentProfilesPdfBytes(project,ids,'first',['total','math'],undefined,font);
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(pages);
    }
  });
});
