/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lesson = { lessonId:'lesson-current', lessonRevision:4, sourceHash:'source-current', rubricScheme:'legacy_three' };
const rows = [];
const sheets = {
  '학생별 현황':[], '교사 평가':[], '질문과 답변':rows, '필수 평가 응답':[]
};
let readCount = 0;
const context = vm.createContext({
  console,
  assertLiteTeacherAccess_:(token) => { if (token !== 'teacher-token') throw new Error('teacher access required'); },
  getLiteSpreadsheet_:() => { readCount += 1; return { getSheetByName:(name) => sheets[name] }; },
  ensureLiteWorkbook_:() => {},
  readLiteTeacherSettings_:() => lesson,
  liteRowsAsObjects_:(sheet) => sheet,
  liteClientData_:(value) => JSON.parse(JSON.stringify(value)),
  liteText_:(value, max) => String(value == null ? '' : value).trim().slice(0, max || Infinity),
  liteAssessmentStartQuestion_:() => '자료에 관해 무엇이 궁금한가요?',
  normalizeLiteRubricScheme_:() => 'legacy_three'
});
const file = path.join(__dirname, '..', 'gas-lite', 'EvaluationService.js');
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename:file });

function pair(requestId, question, overrides = {}) {
  const defaultRow = {
    timestamp:'2026-09-19T02:00:00.000Z', requestId, sessionId:'session-' + requestId,
    studentCode:'12-345', lessonId:lesson.lessonId, lessonRevision:lesson.lessonRevision,
    sourceHash:lesson.sourceHash, isPreview:false, safetyFlag:false,
    engineStatus:'ok:v14', relatedQuestion:true, curriculumRelation:'direct', primaryMove:'check_evidence',
    sourceStatus:'source_insufficient'
  };
  const student = { ...defaultRow, turnNo:2, speaker:'student', text:question, ...overrides.student };
  const bot = { ...defaultRow, turnNo:3, speaker:'bot', text:'자료에서 확인할 수 없어요.', ...overrides.bot };
  rows.push(student, bot);
}

pair('one', '  공청회의   뜻은 무엇인가요?  ');
pair('two', '공청회의 뜻은 무엇인가요？', {
  bot:{ timestamp:'2026-09-19T03:00:00.000Z' }
});
pair('three', '왜 동물원이 보호를 우선하나요?', {
  bot:{ timestamp:'2026-09-19T01:00:00.000Z' }
});
pair('old-revision', '이전 기준 질문?', { bot:{ lessonRevision:3 }, student:{ lessonRevision:3 } });
pair('old-hash', '이전 자료 질문?', { bot:{ sourceHash:'source-old' }, student:{ sourceHash:'source-old' } });
pair('old-lesson', '다른 수업 질문?', { bot:{ lessonId:'other' }, student:{ lessonId:'other' } });
pair('preview', '미리보기 질문?', { bot:{ isPreview:true }, student:{ isPreview:true } });
pair('preview-student', '학생만 미리보기?', { student:{ isPreview:true } });
pair('error-bot', '오류 답변 질문?', { bot:{ engineStatus:'engine_failed:timeout' } });
pair('error-student', '오류 입력 질문?', { student:{ engineStatus:'engine_failed:timeout' } });
pair('safety-bot', '안전 응답 질문?', { bot:{ safetyFlag:true } });
pair('safety-student', '안전 입력 질문?', { student:{ safetyFlag:true } });
pair('off-topic', '수업 밖 질문?', { bot:{ relatedQuestion:false } });
pair('out-of-scope', '범위 밖 질문?', { bot:{ curriculumRelation:'out_of_scope' } });
pair('repair', '다시 작성 질문?', { bot:{ primaryMove:'repair' } });
pair('other-session', '짝이 다른 질문?', { bot:{ sessionId:'other-session' } });
pair('other-student', '짝이 다른 학생 질문?', { bot:{ studentCode:'66-666' } });
pair('turn-gap', '턴 연결이 다른 질문?', { bot:{ turnNo:7 } });
pair('email', '제 이메일 abc@example.com으로 답해주세요?');
pair('phone', '제 연락처 010-1234-5678로 답해주세요?');
pair('name', '제 이름은 홍길동인데 무엇인가요?');
pair('no-bot-question', '질문이 아닌 기록?', { bot:{ sourceStatus:'supported' } });

const snapshot = JSON.stringify(rows);
assert.throws(() => context.getLiteTeacherDashboardData('student-token'), /teacher access required/);
assert.equal(readCount, 0, 'unauthorized requests must not read sheets');
const dashboard = context.getLiteTeacherDashboardData('teacher-token');
const plain = JSON.parse(JSON.stringify(dashboard.sourceReviewQuestions));
assert.deepEqual(plain, [
  { questionText:'공청회의 뜻은 무엇인가요?', count:2, lastAskedAt:'2026-09-19T03:00:00.000Z' },
  { questionText:'왜 동물원이 보호를 우선하나요?', count:1, lastAskedAt:'2026-09-19T01:00:00.000Z' }
]);
assert.deepEqual(Object.keys(plain[0]).sort(), ['count', 'lastAskedAt', 'questionText']);
assert.equal(JSON.stringify(rows), snapshot, 'dashboard read must not change source rows');

pair('long-question', '가'.repeat(220) + '?');
let list = context.getLiteTeacherDashboardData('teacher-token').sourceReviewQuestions;
assert.equal(list.find((entry) => entry.questionText.startsWith('가')).questionText.length, 200);
for (let index = 0; index < 40; index += 1) pair('extra-' + index, `자료에 없는 사실 ${index}은 무엇인가요?`);
list = context.getLiteTeacherDashboardData('teacher-token').sourceReviewQuestions;
assert.equal(list.length, 30, 'review queue is bounded');

console.log('gas-lite teacher source-review queue: current source, pairing, privacy, dedupe, cap, auth PASS');
