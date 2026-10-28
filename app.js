(()=>{'use strict';
const VERSION='1.0.0';
const $=id=>document.getElementById(id);
const DEFAULT_COLUMNS=[['company','상호','text'],['industry','업종','select'],['ceo','대표자','text'],['phone','휴대폰번호','tel'],['email','이메일','email'],['fax','팩스','tel'],['address','주소','text'],['status','진행 상태','status'],['service','관리 서비스','text'],['start','계약 시작일','date'],['fee','월 관리비','currency'],['memo','메모','longtext']].map(([id,label,type])=>({id,label,type,width:160,hidden:false}));
const DEFAULT_INDUSTRIES=['숙박','미용·뷰티','카페·음식점','소매·쇼핑','기타'];
const DEFAULT_STATUS=['계약중','상담중','대기','종료'];
const DRIVE_NAME='ClientDesk_거래처_자동동기화.json';
const API='https://www.googleapis.com/drive/v3/files';
const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
const CAL_API='https://www.googleapis.com/calendar/v3/calendars/primary/events';
const SCOPE='https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events';
const CLIENT_ID_KEY='wwtt_mobile_web_oauth_id';
const FILE_ID_KEY='wwtt_mobile_drive_file_id';
const REVISION_KEY='wwtt_mobile_cloud_revision';
let db,state={columns:DEFAULT_COLUMNS,rows:[],industries:[...DEFAULT_INDUSTRIES],dense:false};
let dirty=false,knownRevision='',driveFileId='',salt='',aesKey=null,token='',tokenExpires=0;
let syncBusy=false,syncConflict=false,editId=null,editing=false,currentTab='clients',statusFilter='전체',industryFilter='',search='';
let calendarEvents=[],calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),selectedDay=dateLocal(new Date()),eventId=null,eventSource=null;
let toastTimer=null,uploadTimer=null,installPrompt=null,lastSyncAt='',syncRetryMs=0;
function uid(){return crypto.randomUUID?.()||`mob-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateLocal(d){const v=new Date(d);return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;}
function addDays(s,delta){const [y,m,d]=s.split('-').map(Number);return dateLocal(new Date(y,m-1,d+delta));}
function readLocal(k){try{return localStorage.getItem(k)||'';}catch{return '';}}
function writeLocal(k,v){try{localStorage.setItem(k,v);}catch{}}
function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),3300);}
function status(msg,tone='ok'){const dot=$('statusDot');$('statusText').textContent=msg;dot.className='dot'+(tone==='ok'?'':tone==='warn'?' warn':tone==='error'?' error':' muted');$('syncHealth').textContent=syncBusy?'동기화 중…':dirty?'동기화 대기':lastSyncAt||'';}
function validSnapshot(s){return !!(s&&Array.isArray(s.columns)&&s.columns.length>0&&s.columns.length<=150&&Array.isArray(s.rows)&&s.rows.length<=100000&&s.columns.every(c=>c&&typeof c.id==='string'&&typeof c.label==='string'&&['text','longtext','tel','email','number','currency','date','status','select'].includes(c.type)));}
function normalize(s){if(!validSnapshot(s))throw Error('지원하지 않는 백업 파일입니다.');const cols=s.columns.map(c=>({...c,copyEnabled:!!c.copyEnabled}));let industries=Array.isArray(s.industries)?s.industries:DEFAULT_INDUSTRIES;industries=[...new Set([...industries,...s.rows.map(r=>r.values?.industry||'')].map(v=>String(v||'').trim()).filter(Boolean))].slice(0,120);return {...s,columns:cols,rows:s.rows.map(r=>({...r,id:String(r.id||uid()),values:{...(r.values||{})}})),industries};}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('wwtt-mobile-clientdesk-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbRead(){return new Promise((resolve,reject)=>{const req=db.transaction('data','readonly').objectStore('data').get('main');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbWrite(value){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,'main');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
let writeQueue=Promise.resolve();
function localRecord(snapshot=state,localDirty=dirty){const remember=!!$('rememberKey')?.checked;return {snapshot:structuredClone(snapshot),dirty:localDirty,remember,key:remember?aesKey:null,keySalt:remember?salt:''};}
async function persist(){const record=localRecord();writeQueue=writeQueue.catch(()=>{}).then(()=>dbWrite(record));await writeQueue;}
async function changed(){localChangeSeq++;dirty=true;await persist();renderClients();if(!aesKey||!token){status('이 기기에 저장됨 · Drive 연결 필요','warn');return;}status('로컬 저장 완료 · Drive 업로드 대기','warn');scheduleUpload();}
function scheduleUpload(delay=1200){clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>syncRound('upload').catch(e=>status(e.message,'error')),delay);}
function renderStats(){const rows=state.rows.filter(r=>!r.demo);$('stats').innerHTML=[['전체 거래처',rows.length],['계약중',rows.filter(r=>r.values.status==='계약중').length],['상담중',rows.filter(r=>r.values.status==='상담중').length],['대기',rows.filter(r=>r.values.status==='대기').length]].map(([name,n])=>`<div class="stat"><small>${name}</small><strong>${n}</strong></div>`).join('');}
function renderClients(){renderStats();const arr=state.rows.filter(r=>!r.demo).filter(r=>(statusFilter==='전체'||r.values.status===statusFilter)&&(!industryFilter||r.values.industry===industryFilter)&&(!search||Object.values(r.values).some(v=>String(v).toLowerCase().includes(search.toLowerCase()))));$('clientCount').textContent=arr.length+'건';$('statusFilters').innerHTML=['전체',...DEFAULT_STATUS].map(st=>`<button class="chip ${statusFilter===st?'active':''}" data-status="${safe(st)}">${safe(st)}</button>`).join('');const s=$('industryFilter');const current=industryFilter;s.replaceChildren(new Option('전체 업종',''),...state.industries.map(x=>new Option(x,x)));s.value=current;if(s.value!==current){industryFilter='';s.value='';}const list=$('clientList');list.replaceChildren();if(!arr.length){list.innerHTML='<div class="empty">표시할 거래처가 없습니다.<br>거래처를 추가하거나 필터를 변경해 주세요.</div>';return;}for(const r of arr){const v=r.values;const card=document.createElement('button');card.type='button';card.className='client-card';card.dataset.row=r.id;card.innerHTML=`<div class="client-card-head"><div style="min-width:0"><span class="company-name">${safe(v.company||'이름 없는 거래처')}</span><span class="company-sub">${safe(v.address||v.service||'주소 미등록')}</span></div><span class="pill ${v.status==='계약중'?'contract':v.status==='대기'?'wait':v.status==='종료'?'end':''}">${safe(v.status||'상태 미정')}</span></div><div class="card-info"><span class="pill">${safe(v.industry||'업종 미지정')}</span><span class="info">${safe(v.ceo||'대표자 미등록')}</span><span class="info">${safe(v.phone||'연락처 미등록')}</span></div>`;list.appendChild(card);}}
function inputType(type){return ({date:'date',email:'email',tel:'tel',number:'number',currency:'number'})[type]||'text';}
function openClient(rowId=null){editId=rowId;const r=state.rows.find(x=>x.id===rowId);editing=true;$('clientModalTitle').textContent=r?'거래처 수정':'거래처 추가';$('deleteClient').hidden=!r;const fields=$('clientFields');fields.replaceChildren();for(const c of state.columns){const label=document.createElement('label');label.textContent=c.label;let field;if(c.type==='select'||c.type==='status'){field=document.createElement('select');const opts=c.id==='industry'?state.industries:c.type==='status'?DEFAULT_STATUS:(c.options||[]);field.add(new Option('선택 안 함',''));for(const x of opts)field.add(new Option(x,x));}else if(c.type==='longtext'){field=document.createElement('textarea');field.rows=3;}else{field=document.createElement('input');field.type=inputType(c.type);if(c.type==='tel')field.setAttribute('inputmode','tel');}field.name=c.id;field.value=String(r?.values?.[c.id]??'');if(c.id==='company')field.required=true;field.maxLength=20000;label.appendChild(field);if(c.copyEnabled&&r&&r.values[c.id]){const copy=document.createElement('button');copy.type='button';copy.className='inline-copy';copy.textContent='복사';copy.onclick=()=>navigator.clipboard.writeText(field.value).then(()=>notify('복사했습니다'));label.append(copy);}fields.append(label);}$('clientDialog').showModal();}
async function saveClient(e){e.preventDefault();const dialog=$('clientDialog');const values={...(state.rows.find(r=>r.id===editId)?.values||{})};const data=new FormData($('clientForm'));for(const [k,v] of data.entries())values[k]=String(v);if(!values.company?.trim()){notify('상호를 입력해 주세요.');return;}const existing=state.rows.find(r=>r.id===editId);if(existing){existing.values=values;}else state.rows.push({id:uid(),demo:false,values});dialog.close();editing=false;await changed();notify('거래처를 저장했습니다.');}
async function deleteClient(){if(!editId||!confirm('이 거래처를 삭제할까요? 다른 기기에서도 동기화됩니다.'))return;state.rows=state.rows.filter(r=>r.id!==editId);$('clientDialog').close();editing=false;await changed();notify('거래처를 삭제했습니다.');}
function renderIndustries(){$('industryList').replaceChildren();state.industries.forEach((name,i)=>{const div=document.createElement('div');div.className='industry-line';const label=document.createElement('strong');label.textContent=name+' · '+state.rows.filter(r=>r.values.industry===name).length+'건';div.append(label);for(const [text,act,disabled] of [['↑','up',i===0],['↓','down',i===state.industries.length-1],['이름','rename',false],['삭제','remove',false]]){const btn=document.createElement('button');btn.textContent=text;btn.dataset.act=act;btn.dataset.idx=i;btn.disabled=disabled;div.append(btn);}$('industryList').append(div);});}
async function industryAction(e){const btn=e.target.closest('[data-act]');if(!btn)return;const idx=+btn.dataset.idx,n=state.industries[idx];if(btn.dataset.act==='up'||btn.dataset.act==='down'){const to=idx+(btn.dataset.act==='up'?-1:1);[state.industries[idx],state.industries[to]]=[state.industries[to],state.industries[idx]];}else if(btn.dataset.act==='rename'){const v=prompt('업종 이름 변경',n)?.trim();if(!v||v===n)return;if(state.industries.includes(v)){notify('이미 존재하는 업종입니다.');return;}state.industries[idx]=v;for(const r of state.rows)if(r.values.industry===n)r.values.industry=v;}else if(btn.dataset.act==='remove'){if(!confirm(`「${n}」 업종을 삭제할까요? 거래처는 유지되고 업종만 비워집니다.`))return;state.industries.splice(idx,1);for(const r of state.rows)if(r.values.industry===n)r.values.industry='';}await changed();renderIndustries();}
async function industryAdd(e){e.preventDefault();const value=$('newIndustry').value.trim();if(!value)return;if(state.industries.includes(value)){notify('이미 있는 업종입니다.');return;}state.industries.push(value);$('newIndustry').value='';await changed();renderIndustries();}
function switchView(which){currentTab=which;for(const k of ['clients','calendar','settings']){$(k+'View').hidden=k!==which;$('tab'+k[0].toUpperCase()+k.slice(1)).classList.toggle('active',k===which);}if(which==='calendar'){renderCalendar();if(token)calendarRefresh().catch(e=>notify(e.message));}if(which==='clients')renderClients();window.scrollTo({top:0,behavior:'instant'});}
function fileDownload(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},3000);}
/* Browser OAuth. A web OAuth client ID must belong to the same Google Cloud
 * project as the existing extension client and have the hosted HTTPS origin. */
function accessReady(){return token&&Date.now()<tokenExpires-60000;}
function ensureGoogleScript(){if(!window.google?.accounts?.oauth2)throw Error('Google 로그인 라이브러리를 불러오지 못했습니다. 인터넷 연결과 브라우저 팝업 설정을 확인하세요.');}
function connectGoogle(){
 ensureGoogleScript();const id=$('oauthId').value.trim();
 if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(id))throw Error('웹 OAuth 클라이언트 ID를 먼저 설정하세요.');
 const client=google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:async response=>{
  if(response.error){status('Google 승인 실패: '+response.error,'error');return;}
  if(!response.access_token){status('Google 로그인 토큰을 받지 못했습니다.','error');return;}
  token=response.access_token;tokenExpires=Date.now()+Number(response.expires_in||3600)*1000;
  $('googleInfo').textContent='Google 인증 완료 · Drive·Calendar 권한 확보 (접근 토큰은 이 세션에서만 보관)';
  status('Google 연결됨 · PC 백업 PIN을 입력해 주세요');
  if(aesKey)syncRound().catch(e=>status(e.message,'error'));
  if(currentTab==='calendar')calendarRefresh().catch(e=>notify(e.message));
 },error_callback:()=>{status('Google 로그인 팝업이 닫히거나 차단되었습니다.','error');}});
 client.requestAccessToken({prompt:''});
}
async function driveRequest(url,options={}){
 if(!accessReady()){token='';throw Error('Google 연결 시간이 만료되었습니다. Google 계정을 다시 연결하세요.');}
 const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`},cache:'no-store'});
 if(response.status===401){token='';throw Error('Google 인증이 만료되었습니다. 다시 연결해 주세요.');}
 if(!response.ok){const msg=await response.text().catch(()=>'');throw Error(`Google Drive 오류 ${response.status} · ${msg.slice(0,140)}`);}
 return response.json();
}
async function locateFile(){
 const typed=$('driveFileId').value.trim();
 if(typed&&typed!==driveFileId)driveFileId=typed;
 if(driveFileId){
  try{
   const meta=await driveRequest(`${API}/${encodeURIComponent(driveFileId)}?fields=id,name,version,modifiedTime,trashed`);
   if(!meta.trashed&&meta.name===DRIVE_NAME)return meta;
   throw Error('지정된 파일이 PC 거래처 동기화 파일이 아닙니다.');
  }catch(e){if(!/오류 404/.test(e.message))throw e;driveFileId='';}
 }
 const qs=new URLSearchParams({q:`name = '${DRIVE_NAME}' and trashed = false`,fields:'nextPageToken,files(id,name,version,modifiedTime)',pageSize:'100'});
 const result=await driveRequest(`${API}?${qs}`);
 if(result.files?.length>1)throw Error('동일한 이름의 Drive 백업이 여러 개 있습니다. 파일 ID를 지정하세요.');
 const meta=result.files?.[0];
 if(!meta)throw Error('PC 동기화 파일을 찾지 못했습니다. PC에서 먼저 Google Drive 동기화를 완료하고, 같은 계정인지 확인하세요.');
 driveFileId=meta.id;$('driveFileId').value=driveFileId;writeLocal(FILE_ID_KEY,driveFileId);return meta;
}
async function readEnvelope(meta){return driveRequest(`${API}/${encodeURIComponent(meta.id)}?alt=media`);}
async function uploadEnvelope(meta,data){return driveRequest(`${UPLOAD}/${encodeURIComponent(meta.id)}?uploadType=media&fields=id,version,modifiedTime`,{method:'PATCH',headers:{'Content-Type':'application/json;charset=utf-8'},body:JSON.stringify(data)});}
async function applyCloud(remote,rev){
 if(editing){status('거래처 편집 완료 후 동기화합니다','warn');return;}
 const incoming=normalize(remote);
 await writeQueue.catch(()=>{});
 await dbWrite(localRecord(incoming,false));
 state=incoming;dirty=false;knownRevision=rev;writeLocal(REVISION_KEY,rev);syncConflict=false;$('conflictMessage').hidden=true;
 renderClients();lastSyncAt=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});status('PC·모바일 거래처 동기화 완료');
}
async function connectDrive(){
 if(!accessReady())throw Error('먼저 Google 계정을 연결해 주세요.');
 const pin=$('pinCode').value.trim();if(!/^\d{4}$/.test(pin))throw Error('PC에서 사용하던 숫자 4자리 PIN을 입력하세요.');
 // Derive a candidate key first; never replace local data until MAC is verified.
 syncBusy=true;status('기존 PC 암호화 백업 확인 중…','warn');
 try{
  const meta=await locateFile(),env=await readEnvelope(meta);
  const candidate=await WWTT_CRYPTO.keyFromPin(pin,env.keySalt);
  const remote=await WWTT_CRYPTO.unseal(env,candidate);
  aesKey=candidate;salt=env.keySalt;$('pinCode').value='';driveFileId=meta.id;writeLocal(FILE_ID_KEY,meta.id);await persist();
  if(dirty){
   if(env.revision===knownRevision){status('PIN 확인 완료 · 내 변경사항 업로드 준비','warn');}
   else{syncConflict=true;$('conflictMessage').hidden=false;status('PC와 휴대폰 데이터 충돌 · 자동 덮어쓰기 중지','warn');return;}
  }else if(env.revision!==knownRevision)await applyCloud(remote,env.revision);
  else status('PC 백업 연결 완료');
 }finally{syncBusy=false;}
 if(dirty&&!syncConflict)scheduleUpload();
}
async function syncRound(reason='check'){
 if(syncBusy||syncConflict||!aesKey||!accessReady()||editing)return;
 syncBusy=true;
 try{
  await writeQueue;
  const meta=await locateFile();const env=await readEnvelope(meta);
  if(env.keySalt!==salt){syncConflict=true;throw Error('PC Drive 파일의 PIN 정보가 달라졌습니다. 자동 동기화를 중단합니다.');}
  if(env.revision!==knownRevision){
   if(dirty){syncConflict=true;$('conflictMessage').hidden=false;throw Error('PC와 휴대폰에서 동시에 변경 감지 · 자동 덮어쓰기 방지');}
   await applyCloud(await WWTT_CRYPTO.unseal(env,aesKey),env.revision);
  }else if(dirty){
   const changeSeq=localChangeSeq;
   // The preflight revision comparison prevents ordinary overwrites, though
   // simultaneous writes within one network roundtrip still require a server lock.
   const prepared=await WWTT_CRYPTO.seal(structuredClone(state),aesKey,salt);
   await uploadEnvelope(meta,prepared);
   knownRevision=prepared.revision;writeLocal(REVISION_KEY,knownRevision);
   if(changeSeq===localChangeSeq){dirty=false;await persist();}
   lastSyncAt=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
   status(dirty?'후속 수정사항 동기화 대기':'휴대폰 변경 → PC 동기화 완료');
  }else{lastSyncAt=new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});status('Google Drive 동기화 최신 상태');}
  syncRetryMs=0;
  $('lastSynced').textContent='마지막 확인: '+lastSyncAt+' · PC가 실행 중이면 약 15초 내 반영됩니다.';
  if(!dirty&&!editing)maybeActivateUpdate();
 }catch(e){syncRetryMs=Math.min(120000,syncRetryMs?syncRetryMs*2:15000);status('동기화 중단 · '+e.message,'error');throw e;}
 finally{syncBusy=false;if(dirty&&!syncConflict&&accessReady())scheduleUpload(syncRetryMs||1200);}
}
async function forceCloud(){
 if(!accessReady()||!aesKey)throw Error('먼저 Google 계정과 PIN을 연결하세요.');
 if(dirty&&!confirm('휴대폰에서 아직 업로드하지 않은 수정 내용이 사라질 수 있습니다. JSON 백업 후 계속하시겠습니까?'))return;
 if(dirty)fileDownload('위원투탑_덮어쓰기전_휴대폰백업.json',JSON.stringify(state,null,2));
 syncBusy=true;
 try{const meta=await locateFile(),env=await readEnvelope(meta);if(env.keySalt!==salt)throw Error('PIN이 다른 Drive 파일입니다.');const remote=await WWTT_CRYPTO.unseal(env,aesKey);await applyCloud(remote,env.revision);notify('Drive 자료로 안전하게 복원했습니다.');}
 finally{syncBusy=false;}
}
let localChangeSeq=0;
async function exportData(){fileDownload(`위원투탑_모바일_백업_${dateLocal(new Date())}.json`,JSON.stringify(state,null,2));notify('백업 파일을 내려받았습니다.');}
async function importData(file){if(!file)return;const snapshot=normalize(JSON.parse(await file.text()));if(!confirm(`거래처 ${snapshot.rows.length}개를 휴대폰에 불러올까요? 현재 로컬 데이터는 변경됩니다.`))return;fileDownload('위원투탑_가져오기전_백업.json',JSON.stringify(state,null,2));state=snapshot;localChangeSeq++;await changed();notify('JSON 복원 완료. Drive 연결 시 충돌 여부를 확인하세요.');}
/* Google Calendar API: only the event fields the editor changes are PATCHed;
 * other clients' attendees, recurrence and reminders are preserved. */
async function calendarRequest(path='',options={}){
 if(!accessReady())throw Error('Google 로그인 후 캘린더를 연결하세요.');
 const res=await fetch(CAL_API+path,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},cache:'no-store'});
 if(res.status===401){token='';throw Error('Google 인증 만료 · 다시 연결해 주세요.');}
 if(!res.ok)throw Error('Google Calendar 오류 '+res.status+': '+(await res.text()).slice(0,140));
 return res.status===204?{}:res.json();
}
function timeOf(ev){if(ev.start?.date)return '종일';const d=new Date(ev.start?.dateTime);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});}
function evDay(ev){return ev.start?.date||dateLocal(new Date(ev.start?.dateTime));}
async function calendarRefresh(){if(!accessReady())return;const start=new Date(calMonth.getFullYear(),calMonth.getMonth(),-7).toISOString(),end=new Date(calMonth.getFullYear(),calMonth.getMonth()+2,7).toISOString();const query=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',maxResults:'2500'});let events=[],next='';for(let p=0;p<5;p++){if(next)query.set('pageToken',next);const result=await calendarRequest('?'+query);events.push(...(result.items||[]));next=result.nextPageToken||'';if(!next)break;}calendarEvents=events.filter(ev=>ev.status!=='cancelled');renderCalendar();}
function renderCalendar(){const title=$('monthTitle');title.textContent=`${calMonth.getFullYear()}년 ${calMonth.getMonth()+1}월`;const grid=$('monthGrid');grid.replaceChildren();for(const wd of ['일','월','화','수','목','금','토']){const e=document.createElement('div');e.className='weekday';e.textContent=wd;grid.append(e);}const begin=new Date(calMonth.getFullYear(),calMonth.getMonth(),1-calMonth.getDay());for(let i=0;i<42;i++){const d=new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+i),date=dateLocal(d),items=calendarEvents.filter(ev=>evDay(ev)===date);const btn=document.createElement('button');btn.type='button';const holiday=window.WWTT_HOLIDAYS?.[date]||'';btn.className='day-cell'+(d.getMonth()!==calMonth.getMonth()?' dim':'')+(selectedDay===date?' selected':'')+(holiday?' holiday':'');btn.dataset.day=date;btn.innerHTML=`<span>${d.getDate()}</span>${holiday?'<em>'+safe(holiday)+'</em>':''}${items.length?'<b aria-label="일정 '+items.length+'건"></b>':''}`;grid.append(btn);}renderDayEvents();}
function renderDayEvents(){$('selectedDateLabel').textContent=selectedDay;$('dayEvents').replaceChildren();const arr=calendarEvents.filter(ev=>evDay(ev)===selectedDay).sort((a,b)=>(a.start?.dateTime||'').localeCompare(b.start?.dateTime||''));if(!arr.length){$('dayEvents').innerHTML='<div class="empty">선택한 날짜의 일정이 없습니다.<br>+ 일정 버튼으로 새 일정을 추가해 주세요.</div>';return;}for(const ev of arr){const div=document.createElement('div');div.className='event-card';const title=document.createElement('div');title.innerHTML=`<strong>${safe(ev.summary||'제목 없음')}</strong><small>${safe(timeOf(ev))} · ${safe(ev.location||'장소 없음')}</small>`;const actions=document.createElement('div');actions.className='event-actions';for(const [label,action] of [['수정','edit'],['복사','copy']]){const btn=document.createElement('button');btn.textContent=label;btn.dataset.eventId=ev.id;btn.dataset.action=action;actions.append(btn);}div.append(title,actions);$('dayEvents').append(div);}}
function openEvent(ev=null,copy=false){if(!accessReady()){notify('설정에서 Google에 먼저 연결하세요.');switchView('settings');return;}eventId=ev&&!copy?ev.id:null;eventSource=ev&&!copy?ev:null;$('eventModalTitle').textContent=copy?'일정 복사':ev?'일정 수정':'새 일정';$('deleteEvent').hidden=!eventId;const form=$('eventForm');form.reset();form.elements.summary.value=ev?.summary||'';form.elements.date.value=ev?evDay(ev):selectedDay;const isAllDay=!!ev?.start?.date;form.elements.allDay.checked=isAllDay;form.elements.start.disabled=isAllDay;form.elements.end.disabled=isAllDay;form.elements.endDate.value=ev?(ev.end?.date?addDays(ev.end.date,-1):dateLocal(new Date(ev.end?.dateTime||ev.start?.dateTime))):selectedDay;const at=ev?.start?.dateTime?new Date(ev.start.dateTime):null,until=ev?.end?.dateTime?new Date(ev.end.dateTime):null;const hhmm=d=>d?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:null;form.elements.start.value=hhmm(at)||'09:00';form.elements.end.value=hhmm(until)||'10:00';form.elements.location.value=ev?.location||'';form.elements.description.value=ev?.description||'';form.elements.type.value=ev?.extendedProperties?.private?.clientDeskType||'personal';form.elements.color.value=['white','green','yellow','pink','lavender','iceblue'].includes(ev?.extendedProperties?.private?.clientDeskColor)?ev.extendedProperties.private.clientDeskColor:'white';$('eventClient').replaceChildren(new Option('연결 안 함',''),...state.rows.filter(r=>!r.demo&&r.values.company).map(r=>new Option(r.values.company,r.id)));$('eventClient').value=ev?.extendedProperties?.private?.clientDeskClientId||'';$('eventDialog').showModal();}
async function eventSubmit(e){e.preventDefault();if(!accessReady())throw Error('Google 연결이 필요합니다.');const f=$('eventForm').elements;const day=f.date.value,endDay=f.endDate.value,start=f.start.value,end=f.end.value,isAllDay=f.allDay.checked;if(!day||!endDay||(isAllDay?endDay<day:(new Date(`${endDay}T${end}:00+09:00`)<=new Date(`${day}T${start}:00+09:00`)))){notify('올바른 시작·종료 날짜와 시간을 입력하세요.');return;}const selectedClient=state.rows.find(r=>r.id===f.client.value);const patch={summary:f.summary.value.trim(),description:f.description.value,location:f.location.value,start:isAllDay?{date:day}:{dateTime:`${day}T${start}:00+09:00`,timeZone:'Asia/Seoul'},end:isAllDay?{date:addDays(endDay,1)}:{dateTime:`${endDay}T${end}:00+09:00`,timeZone:'Asia/Seoul'}};if(!patch.summary){notify('제목을 입력해 주세요.');return;}const props={...(eventSource?.extendedProperties?.private||{}),clientDeskApp:'1',clientDeskType:f.type.value,clientDeskColor:f.color.value};if(selectedClient){props.clientDeskClientId=selectedClient.id;props.clientDeskClientName=selectedClient.values.company;}else{delete props.clientDeskClientId;delete props.clientDeskClientName;}patch.extendedProperties={private:props};const btn=f.querySelector?.('button')||$('eventForm').querySelector('[type="submit"]');if(btn)btn.disabled=true;try{await calendarRequest(eventId?'/'+encodeURIComponent(eventId):'',{method:eventId?'PATCH':'POST',body:JSON.stringify(patch)});$('eventDialog').close();notify('Google 캘린더에 저장했습니다.');await calendarRefresh();}finally{if(btn)btn.disabled=false;}}
async function eventDelete(){if(!eventId||!confirm('Google 캘린더에서도 이 일정을 삭제할까요?'))return;await calendarRequest('/'+encodeURIComponent(eventId),{method:'DELETE'});$('eventDialog').close();notify('일정을 삭제했습니다.');await calendarRefresh();}
function onError(e){console.error(e);notify(e?.message||'처리 중 오류가 발생했습니다.');}
function bind(){
 document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
 $('headerSync').addEventListener('click',()=>syncRound().catch(onError));
 $('statusFilters').addEventListener('click',e=>{const b=e.target.closest('[data-status]');if(b){statusFilter=b.dataset.status;renderClients();}});
 $('industryFilter').addEventListener('change',e=>{industryFilter=e.target.value;renderClients();});
 $('clientSearch').addEventListener('input',e=>{search=e.target.value;renderClients();});
 $('clientList').addEventListener('click',e=>{const b=e.target.closest('[data-row]');if(b)openClient(b.dataset.row);});
 $('addClient').addEventListener('click',()=>openClient());
 $('clientForm').addEventListener('submit',e=>saveClient(e).catch(onError));
 $('deleteClient').addEventListener('click',()=>deleteClient().catch(onError));
 $('clientDialog').addEventListener('close',()=>{editing=false;if(aesKey&&!syncBusy&&accessReady())syncRound().catch(onError);});
 $('manageIndustries').addEventListener('click',()=>{renderIndustries();$('industryDialog').showModal();});
 $('industryAddForm').addEventListener('submit',e=>industryAdd(e).catch(onError));
 $('industryList').addEventListener('click',e=>industryAction(e).catch(onError));
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
 $('rememberKey').addEventListener('change',()=>persist().catch(onError));
 $('saveOAuth').addEventListener('click',()=>{const id=$('oauthId').value.trim();if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(id)){notify('올바른 웹 OAuth 클라이언트 ID를 입력하세요.');return;}writeLocal(CLIENT_ID_KEY,id);notify('웹 OAuth 클라이언트 ID를 저장했습니다.');});
 $('connectGoogle').addEventListener('click',()=>{try{connectGoogle();}catch(e){onError(e);}});
 $('connectDrive').addEventListener('click',()=>connectDrive().catch(onError));
 $('syncNow').addEventListener('click',()=>syncRound().catch(onError));
 $('loadCloud').addEventListener('click',()=>forceCloud().catch(onError));
 $('exportJson').addEventListener('click',exportData);
 $('importJson').addEventListener('click',()=>$('importFile').click());
 $('importFile').addEventListener('change',e=>importData(e.target.files?.[0]).catch(onError));
 $('checkUpdate').addEventListener('click',()=>checkUpdates(true).catch(onError));
 $('prevMonth').addEventListener('click',()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1);calendarEvents=[];renderCalendar();if(accessReady())calendarRefresh().catch(onError);});
 $('nextMonth').addEventListener('click',()=>{calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1);calendarEvents=[];renderCalendar();if(accessReady())calendarRefresh().catch(onError);});
 $('todayMonth').addEventListener('click',()=>{calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectedDay=dateLocal(new Date());renderCalendar();if(accessReady())calendarRefresh().catch(onError);});
 $('monthGrid').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){selectedDay=b.dataset.day;renderCalendar();}});
 $('addEvent').addEventListener('click',()=>openEvent());
 $('dayEvents').addEventListener('click',e=>{const b=e.target.closest('[data-event-id]');if(!b)return;const ev=calendarEvents.find(x=>x.id===b.dataset.eventId);if(ev)openEvent(ev,b.dataset.action==='copy');});
 $('eventForm').addEventListener('submit',e=>eventSubmit(e).catch(onError));
 $('eventForm').elements.allDay.addEventListener('change',e=>{for(const name of ['start','end'])$('eventForm').elements[name].disabled=e.target.checked;});
 $('deleteEvent').addEventListener('click',()=>eventDelete().catch(onError));
 window.addEventListener('online',()=>{if(aesKey&&accessReady())syncRound().catch(onError);});
 window.addEventListener('focus',()=>{if(aesKey&&accessReady())syncRound().catch(onError);if(currentTab==='calendar'&&accessReady())calendarRefresh().catch(onError);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&aesKey&&accessReady())syncRound().catch(onError);});
 setInterval(()=>{if(document.hidden||!navigator.onLine||!accessReady())return;if(aesKey)syncRound().catch(()=>{});if(currentTab==='calendar')calendarRefresh().catch(()=>{});},15000);
}
let reg=null;
function maybeActivateUpdate(){if(reg?.waiting&&!dirty&&!editing)reg.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
async function checkUpdates(manual=false){if(!('serviceWorker' in navigator)){if(manual)notify('이 브라우저는 자동 업데이트를 지원하지 않습니다.');return;}reg=reg||await navigator.serviceWorker.ready;await reg.update();if(reg.waiting){if(!editing&&!dirty){reg.waiting.postMessage({type:'ACTIVATE_UPDATE'});}else{$('updateHint').hidden=false;$('updateHint').textContent='새 버전 확인 · 로컬 변경 동기화 후 적용';}}else if(manual)notify('현재 최신 웹앱 버전입니다.');}
async function registerSW(){if(!('serviceWorker' in navigator)||!window.isSecureContext)return;reg=await navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'});navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!editing&&!dirty)location.reload();else{$('updateHint').hidden=false;}});if(reg.waiting&&!editing&&!dirty)reg.waiting.postMessage({type:'ACTIVATE_UPDATE'});reg.addEventListener('updatefound',()=>{const worker=reg.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller){if(!editing&&!dirty)worker.postMessage({type:'ACTIVATE_UPDATE'});else{$('updateHint').hidden=false;}}});});setInterval(()=>reg.update().catch(()=>{}),60*60*1000);}
async function init(){
 try{db=await openDB();const stored=await dbRead();if(stored?.snapshot){state=normalize(stored.snapshot);dirty=!!stored.dirty;$('rememberKey').checked=!!stored.remember;if(stored.remember&&stored.key){aesKey=stored.key;salt=stored.keySalt||'';}}}
 catch(e){document.body.innerHTML='<main style="padding:30px"><h2>데이터 저장소를 열지 못했습니다</h2><p>기존 데이터를 삭제하지 않았습니다. 브라우저 저장 공간을 확인해 주세요.</p></main>';console.error(e);return;}
 $('oauthId').value=readLocal(CLIENT_ID_KEY);driveFileId=readLocal(FILE_ID_KEY);knownRevision=readLocal(REVISION_KEY);$('driveFileId').value=driveFileId;$('appVersion').textContent=VERSION;
 renderClients();renderCalendar();bind();status(dirty?'휴대폰에 저장됨 · PC 동기화 대기':'모바일 거래처 관리 준비 완료',dirty?'warn':'idle');document.body.classList.add('js-ready');
 registerSW().catch(e=>console.warn('PWA SW registration',e));
}
init();
})();
