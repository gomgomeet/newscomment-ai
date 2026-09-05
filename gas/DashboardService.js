/** TURNS에서 반-번호별 활동을 집계한다. 별도 세션·검색·평가 로그를 읽지 않는다. */
function getTeacherDashboardData(token) { assertTeacherAccess_(token); return getTeacherDashboardData_(); }
function getTeacherDashboardData_() {
  const material = getActiveMaterial_();
  const prefix = encodeURIComponent(material.materialId) + ':';
  const turns = getRowsAsObjects_('TURNS').filter(function (row) {
    return String(row.sessionId).indexOf(prefix) === 0 && !isTruthy_(row.isPreview);
  });
  const codes = Array.from(new Set(turns.map(function (row) { return String(row.studentCode); }))).sort();
  const notes = getRowsAsObjects_('DASHBOARD');
  const students = codes.map(function (code) {
    const history = turns.filter(function (row) { return String(row.studentCode) === code; });
    const summary = phaseSummaryFor_(history, phaseSettingsFor_(material));
    const note = notes.find(function (row) { return String(row.studentCode) === code; });
    return Object.assign({ studentCode: code, teacherNote: note ? note.teacherNote : '' }, summary);
  });
  return { material: {title: material.title}, students: students, readiness: getOperationalReadiness_(),
    reviews: getPendingSupplementReviews_(material).items };
}
function exportTeacherEvaluationCsv(token) {
  assertTeacherAccess_(token);
  const headers = QUESTION_BOT_HEADERS_.DASHBOARD;
  const students = getTeacherDashboardData_().students;
  const csv = [headers].concat(students.map(function (student) { return headers.map(function (h) { return student[h]; }); }))
    .map(function (row) { return row.map(escapeDashboardCsvCell_).join(','); }).join('\r\n');
  return {filename: '질문챗봇_활동.csv', content: '\uFEFF' + csv, mimeType: 'text/csv;charset=utf-8', rowCount: students.length};
}
function escapeDashboardCsvCell_(value) {
  let text = String(value == null ? '' : value).replace(/\r?\n/g, ' ');
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
