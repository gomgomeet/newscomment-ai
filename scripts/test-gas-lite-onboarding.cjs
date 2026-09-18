/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createHash,createHmac} = require('node:crypto');

class Sheet {
  constructor() { this.rows=[];this.writes=0; }
  getLastRow() { return this.rows.length; }
  getRange(row,col,count=1,columns=1) {
    return {getDisplayValues:() => Array.from({length:count},(_,r) => Array.from({length:columns},(_,c) => String(this.rows[row-1+r]?.[col-1+c] ?? ''))),
      setValues:values => {this.writes++;values.forEach((entry,r) => {this.rows[row-1+r] ||= [];entry.forEach((value,c) => {this.rows[row-1+r][col-1+c]=value;});});}};
  }
  setFrozenRows() {}
  autoResizeColumns() {}
}

function setup(options={}) {
  const properties=new Map([['LITE_TEACHER_ACCESS_TOKEN','teacher-only-token'],['TEACHER_OPENAI_API_KEY','private-api-secret']]);
  const sheet=new Sheet();
  const spreadsheet={getSheetByName:name => name==='시작하기' ? sheet : null};
  let projectId=options.projectId || 'synthetic-current-project-1234',uuid=0,locked=false,fetches=0;
  let responder=(url) => {
    const parsed=new URL(url);
    return {status:200,body:c.doGet({parameter:{simbotHealth:parsed.searchParams.get('simbotHealth'),nonce:parsed.searchParams.get('nonce')}}).text};
  };
  const c=vm.createContext({console,
    PropertiesService:{getScriptProperties:() => ({getProperty:key => properties.get(key)||null,
      setProperty:(key,value) => properties.set(key,String(value)),deleteProperty:key => properties.delete(key)})},
    LockService:{getScriptLock:() => ({waitLock() {assert.equal(locked,false);locked=true;},releaseLock() {locked=false;}})},
    Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},
      getUuid:() => '00000000-0000-4000-8000-'+String(++uuid).padStart(12,'0'),
      computeDigest:(alg,text) => createHash(alg).update(text).digest(),
      computeHmacSha256Signature:(text,key) => createHmac('sha256',key).update(text).digest(),
      base64EncodeWebSafe:bytes => Buffer.from(bytes).toString('base64url')},
    ScriptApp:{getScriptId:() => projectId,getService:() => ({getUrl:() => 'https://script.google.com/macros/s/unverified_auto_url/exec'})},
    ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text => ({text,setMimeType(value) {this.mimeType=value;return this;}})},
    HtmlService:{createTemplateFromFile:name => ({evaluate:() => ({name,setTitle() {return this;},addMetaTag() {return this;}})})},
    UrlFetchApp:{fetch:(url,fetchOptions) => {assert.equal(locked,false,'network request stays outside script lock');fetches++;
      assert.equal(fetchOptions.headers,undefined,'no teacher, Google or API credentials go to the webapp');
      assert.equal(fetchOptions.method,'get');assert.equal(fetchOptions.followRedirects,true);
      const result=responder(url);return {getResponseCode:() => result.status,getContentText:() => result.body};}}
  });
  for (const file of ['SetupService','Code']) {
    let source=fs.readFileSync(path.join(__dirname,'..','gas-lite',file+'.js'),'utf8');
    if (options.version) source=source.replace("const LITE_APP_VERSION_ = '0.12.0';",`const LITE_APP_VERSION_ = '${options.version}';`);
    vm.runInContext(source,c,{filename:file});
  }
  c.readLiteTeacherSettings_=() => ({lessonId:'synthetic-lesson'});
  c.getLiteSpreadsheet_=() => spreadsheet;
  c.getLiteTeacherPreviewUrl_=() => '';
  c.buildLiteCurrentReadiness_=() => ({runtimeReady:false,distributionReady:false,checks:[]});
  c.hasLiteApiKey_=c.isLiteApiVerified_=c.hasLiteEngineEndpoint_=c.isLiteEngineVerified_=() => false;
  return {c,properties,sheet,setResponder:fn => {responder=fn;},setProjectId:id => {projectId=id;},get fetches(){return fetches;}};
}

const goodUrl='https://script.google.com/macros/s/synthetic_good_deployment/exec';
const otherUrl='https://script.google.com/macros/s/synthetic_other_deployment/exec';
const token='teacher-only-token';
const nonce='test_challenge_nonce_0123456789';

{
  const {c,properties}=setup();
  const invalid=c.doGet({parameter:{simbotHealth:'deployment-v1',nonce:'tiny'}});
  assert.equal(JSON.parse(invalid.text).code,'invalid_challenge');
  assert.equal(properties.has('LITE_DEPLOYMENT_HEALTH_SECRET'),false,'invalid challenge cannot create secrets');
  const output=c.doGet({parameter:{simbotHealth:'deployment-v1',nonce}});
  const body=JSON.parse(output.text);
  assert.equal(output.mimeType,'application/json');assert.equal(body.ok,true);
  assert.deepEqual(Object.keys(body).sort(),['appVersion','nonce','ok','proof','protocol']);
  assert.equal(body.nonce,nonce);assert.equal(body.proof.length,43);
  assert.equal(output.text.includes('teacher-only-token'),false);assert.equal(output.text.includes('private-api-secret'),false);
  assert.equal(output.text.includes('synthetic-current-project'),false);assert.equal(output.text.includes(properties.get('LITE_DEPLOYMENT_HEALTH_SECRET')),false);
  assert.equal(c.doGet({parameter:{}}).name,'Student','normal student entry remains unchanged');
}

{
  const x=setup(),{c,properties}=x;
  const before=c.getLiteTeacherSetupData(token);
  assert.equal(before.onboarding.authorizationReady,true);assert.equal(before.onboarding.deploymentVerified,false);
  assert.match(before.onboarding.scriptEditorUrl,/\/home\/projects\/synthetic-current-project-1234\/edit$/);
  assert.throws(() => c.saveLiteStudentUrlForTeacher('wrong-token',goodUrl),/Google Sheet/);
  assert.equal(x.fetches,0);
  const result=c.saveLiteStudentUrlForTeacher(token,'  '+goodUrl+'  ');
  assert.equal(result.ok,true);assert.equal(result.confirmedStudentUrl,goodUrl);
  assert.equal(result.onboarding.deploymentVerified,true);assert.ok(result.onboarding.deploymentCheckedAt);
  assert.equal(result.readiness.runtimeReady,false,'deployment verification does not claim API/engine readiness');
  assert.equal(result.readiness.distributionReady,false,'deployment verification does not complete teacher preview');
  const saved=properties.get('LITE_DEPLOYMENT_VERIFIED');
  for (const invalid of ['',goodUrl+'?preview=private',goodUrl+'#fragment','http://script.google.com/macros/s/a/exec',
    'https://script.google.com.evil.test/macros/s/a/exec','https://script.googleusercontent.com/macros/echo?user_content_key=x',
    'https://script.google.com/macros/s/a/dev','https://user:pass@script.google.com/macros/s/a/exec']) {
    assert.throws(() => c.saveLiteStudentUrlForTeacher(token,invalid),/주소/);
    assert.equal(c.getLiteConfirmedStudentUrl_(),goodUrl);assert.equal(properties.get('LITE_DEPLOYMENT_VERIFIED'),saved);
  }
  assert.equal(x.fetches,1,'invalid addresses never make a network request');
  x.setProjectId('synthetic-copy-project-5678');
  assert.equal(c.buildLiteTeacherOnboarding_().deploymentVerified,false,'copied verification is tied to its own project');
  x.setProjectId('synthetic-current-project-1234');
  properties.set('LITE_DEPLOYMENT_VERIFIED',JSON.stringify({...JSON.parse(saved),appVersion:'0.11.0'}));
  assert.equal(c.buildLiteTeacherOnboarding_().deploymentVerified,false,'updated source requires verifying its deployment version');
}

{
  const x=setup(),{c,properties}=x;
  c.saveLiteStudentUrlForTeacher(token,goodUrl);
  const saved=properties.get('LITE_DEPLOYMENT_VERIFIED');
  const failureCases=[
    [{status:404,body:'missing'},/찾을 수 없습니다/],
    [{status:403,body:'forbidden'},/로그인 없이/],
    [{status:200,body:'<html><form action="https://accounts.google.com/ServiceLogin">sign in</form></html>'},/로그인 없이/],
    [{status:503,body:'unavailable'},/정상 응답/],
    [{status:200,body:'<html>old simbot student page</html>'},/현재 버전/],
    [{status:200,body:JSON.stringify({ok:true,protocol:'simbot-deployment-v1',appVersion:'0.11.0',nonce,proof:'old'})},/현재 버전/]
  ];
  for (const [response,expected] of failureCases) {
    x.setResponder(() => response);
    assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),expected);
    assert.equal(c.getLiteConfirmedStudentUrl_(),goodUrl);assert.equal(properties.get('LITE_DEPLOYMENT_VERIFIED'),saved);
  }
  x.setResponder(() => {throw new Error('synthetic timeout');});
  assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),/접속하지 못했습니다/);
  const foreign=setup({projectId:'synthetic-other-project-5678'});
  foreign.properties.set('LITE_DEPLOYMENT_HEALTH_SECRET',properties.get('LITE_DEPLOYMENT_HEALTH_SECRET'));
  x.setResponder(url => ({status:200,body:foreign.c.doGet({parameter:{simbotHealth:'deployment-v1',nonce:new URL(url).searchParams.get('nonce')}}).text}));
  assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),/이 교사 사본/);
  assert.equal(c.getLiteConfirmedStudentUrl_(),goodUrl);assert.equal(properties.get('LITE_DEPLOYMENT_VERIFIED'),saved);
  const old=setup({version:'0.11.9'});
  old.properties.set('LITE_DEPLOYMENT_HEALTH_SECRET',properties.get('LITE_DEPLOYMENT_HEALTH_SECRET'));
  x.setResponder(url => ({status:200,body:old.c.doGet({parameter:{simbotHealth:'deployment-v1',nonce:new URL(url).searchParams.get('nonce')}}).text}));
  assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),/현재 버전/);
  x.setResponder(url => {
    const response=c.liteDeploymentHealthResponse_(new URL(url).searchParams.get('nonce'));
    response.nonce='another_nonce_1234567890';
    return {status:200,body:JSON.stringify(response)};
  });
  assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),/이 교사 사본/);
  assert.equal(c.buildLiteTeacherOnboarding_().deploymentVerified,true,'failed replacement preserves previous verified URL');
}

{
  const x=setup(),{c,properties}=x;
  c.saveLiteStudentUrlForTeacher(token,goodUrl);
  const saved=properties.get('LITE_DEPLOYMENT_VERIFIED');
  x.setResponder(url => {
    const response=c.liteDeploymentHealthResponse_(new URL(url).searchParams.get('nonce'));
    properties.set('LITE_CONFIRMED_STUDENT_URL','https://script.google.com/macros/s/newer_teacher_choice/exec');
    return {status:200,body:JSON.stringify(response)};
  });
  assert.throws(() => c.saveLiteStudentUrlForTeacher(token,otherUrl),/다른 주소가 저장/);
  assert.match(c.getLiteConfirmedStudentUrl_(),/newer_teacher_choice/);assert.equal(properties.get('LITE_DEPLOYMENT_VERIFIED'),saved);
}

{
  const {c,sheet}=setup();
  sheet.rows=[['항목','상태','안내'],['1. API 연결','완료','old'],['2. 평가 설계','완료','old'],
    ['3. 수업자료','완료','old'],['4. 미리보기','완료','old'],['5. 학생 배포','배포 가능','old'],[],[],['교사 개인 메모','보존','내용']];
  const spreadsheet={getSheetByName:() => sheet};
  c.writeLiteStartHere_(spreadsheet);
  assert.equal(sheet.rows[2][0],'1. 최초 준비·권한 승인');assert.equal(sheet.rows[3][0],'2. 웹앱 배포');
  assert.equal(sheet.rows[4][0],'3. 주소 확인·미리보기');
  assert.equal(sheet.rows.slice(1,7).some(row => /완료|배포 가능/.test(row[1])),false);
  assert.match(sheet.rows[6][2],/완료를 뜻하지 않습니다/);
  assert.equal(sheet.rows[8][2],'내용','personal notes outside the guide are retained');
  const writes=sheet.writes;
  c.updateLiteStartHereStatus_(spreadsheet,{distributionReady:true,checks:[{key:'apiSaved',state:'pass'}]});
  assert.equal(sheet.writes,writes,'readiness no longer writes copied completion statuses');
}
console.log('gas-lite onboarding: passed (anonymous project/version proof, URL preservation, access failures, teacher-only state, static copy-safe guide)');
