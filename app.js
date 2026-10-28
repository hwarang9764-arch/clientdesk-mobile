(()=>{'use strict';
const VERSION='1.2.3';
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
const AUTH_SESSION_KEY='wwtt_mobile_google_token_session_v1';
const AUTH_VAULT_KEY='wwtt_mobile_google_token_vault_v1';
const AUTH_VAULT_CRYPTOKEY='wwtt_mobile_google_device_aes_v1';
const LAST_VIEW_KEY='wwtt_mobile_last_view_v1';
const LAST_MONTH_KEY='wwtt_mobile_last_month_v1';
const LAST_DAY_KEY='wwtt_mobile_last_day_v1';
const CALENDAR_CACHE_KEY='calendar-snapshot-v1';
const CALENDAR_MODE_KEY='wwtt_mobile_calendar_expanded';
const THEME_KEY='wwtt_mobile_theme_v1';
const TRASH_TTL=7*24*60*60*1000;
const isTrashEvent=ev=>ev?.extendedProperties?.private?.clientDeskInTrash==='1';
let db,state={columns:DEFAULT_COLUMNS,rows:[],industries:[...DEFAULT_INDUSTRIES],dense:false};
let dirty=false,knownRevision='',driveFileId='',salt='',aesKey=null,token='',tokenExpires=0;
let syncBusy=false,syncConflict=false,editId=null,editing=false,currentTab='clients',statusFilter='전체',industryFilter='',search='';
let calendarEvents=[],calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1),selectedDay=dateLocal(new Date()),eventId=null,eventSource=null;
let calendarExpanded=readLocal(CALENDAR_MODE_KEY)==='1',calendarCacheStamp=0,calendarRequestSeq=0;
let trashCategory='clients',trashCalendarEvents=[],trashBusy=false,trashSweepAt=0;
const eventPending=new Set();
let toastTimer=null,uploadTimer=null,installPrompt=null,lastSyncAt='',syncRetryMs=0;
let authStorageQueue=Promise.resolve(),authInFlight=false,calendarSwipeSuppressUntil=0;
function uid(){return crypto.randomUUID?.()||`mob-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateLocal(d){const v=new Date(d);return `${v.getFullYear()}-${String(v.getMonth()+1).padStart(2,'0')}-${String(v.getDate()).padStart(2,'0')}`;}
function addDays(s,delta){const [y,m,d]=s.split('-').map(Number);return dateLocal(new Date(y,m-1,d+delta));}
function readLocal(k){try{return localStorage.getItem(k)||'';}catch{return '';}}
function writeLocal(k,v){try{localStorage.setItem(k,v);}catch{}}
function sessionGet(k){try{return sessionStorage.getItem(k)||'';}catch{return '';}}
function sessionPut(k,v){try{sessionStorage.setItem(k,v);}catch{}}
function sessionDelete(k){try{sessionStorage.removeItem(k);}catch{}}
function dbGetItem(k){return new Promise((resolve,reject)=>{const req=db.transaction('data','readonly').objectStore('data').get(k);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbSetItem(k,v){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(v,k);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function dbRemoveItem(k){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').delete(k);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function queueAuthWrite(task){authStorageQueue=authStorageQueue.catch(()=>{}).then(task).catch(e=>console.warn('Google 인증 보관 처리 실패',e));return authStorageQueue;}
async function getLocalTokenKey(){
 let key=await dbGetItem(AUTH_VAULT_CRYPTOKEY);
 if(key)return key;
 key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 await dbSetItem(AUTH_VAULT_CRYPTOKEY,key);
 return key;
}
async function saveEncryptedToken(value,expiresAt,clientId){
 if(!db||!crypto?.subtle||!value||!clientId)return;
 const key=await getLocalTokenKey(),iv=crypto.getRandomValues(new Uint8Array(12));
 const payload=new TextEncoder().encode(JSON.stringify({token:value,expiresAt,clientId}));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,payload);
 await dbSetItem(AUTH_VAULT_KEY,{v:1,iv:Array.from(iv),cipher:Array.from(new Uint8Array(encrypted)),expiresAt,clientId});
}
async function restoreEncryptedToken(){
 if(!db||!crypto?.subtle)return false;
 try{
  await authStorageQueue.catch(()=>{});
  const record=await dbGetItem(AUTH_VAULT_KEY);
  if(!record||record.v!==1)return false;
  const savedId=readLocal(CLIENT_ID_KEY);
  if(record.clientId!==savedId||record.expiresAt<=Date.now()+30000){queueAuthWrite(()=>dbRemoveItem(AUTH_VAULT_KEY));return false;}
  const key=await dbGetItem(AUTH_VAULT_CRYPTOKEY);if(!key)return false;
  const buf=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(record.iv)},key,new Uint8Array(record.cipher));
  const data=JSON.parse(new TextDecoder().decode(buf));
  if(data.clientId!==savedId||data.expiresAt!==record.expiresAt||typeof data.token!=='string')return false;
  token=data.token;tokenExpires=data.expiresAt;
  sessionPut(AUTH_SESSION_KEY,JSON.stringify({accessToken:token,expiresAt:tokenExpires,clientId:savedId}));
  return accessReady();
 }catch(e){console.warn('Google 인증 세션 복구 실패',e);return false;}
}
function restoreNavigation(){
 const tab=readLocal(LAST_VIEW_KEY);if(['clients','calendar','settings','trash'].includes(tab))currentTab=tab;
 const month=readLocal(LAST_MONTH_KEY);
 if(/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)){const [y,m]=month.split('-').map(Number);calMonth=new Date(y,m-1,1);}
 const day=readLocal(LAST_DAY_KEY);
 if(/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(day)){
  const [y,m,d]=day.split('-').map(Number);const check=new Date(y,m-1,d);
  if(dateLocal(check)===day)selectedDay=day;
 }
}
function saveCalendarPosition(){writeLocal(LAST_MONTH_KEY,`${calMonth.getFullYear()}-${String(calMonth.getMonth()+1).padStart(2,'0')}`);writeLocal(LAST_DAY_KEY,selectedDay);}
function shiftCalendarMonth(delta){
 const oldDay=Number(selectedDay.slice(-2))||1;
 calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+delta,1);
 const day=Math.min(oldDay,new Date(calMonth.getFullYear(),calMonth.getMonth()+1,0).getDate());
 selectedDay=dateLocal(new Date(calMonth.getFullYear(),calMonth.getMonth(),day));
 saveCalendarPosition();renderCalendar();if(accessReady())calendarRefresh().catch(onError);
}

function notify(msg){const t=$('toast');t.textContent=msg;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),3300);}
function status(msg,tone='ok'){const dot=$('statusDot');$('statusText').textContent=msg;dot.className='dot'+(tone==='ok'?'':tone==='warn'?' warn':tone==='error'?' error':' muted');$('syncHealth').textContent=syncBusy?'동기화 중…':dirty?'동기화 대기':lastSyncAt||'';}
function validSnapshot(s){return !!(s&&Array.isArray(s.columns)&&s.columns.length>0&&s.columns.length<=150&&Array.isArray(s.rows)&&s.rows.length<=100000&&s.columns.every(c=>c&&typeof c.id==='string'&&typeof c.label==='string'&&['text','longtext','tel','email','number','currency','date','status','select'].includes(c.type)));}
function normalize(s){if(!validSnapshot(s))throw Error('지원하지 않는 백업 파일입니다.');const cols=s.columns.map(c=>({...c,copyEnabled:!!c.copyEnabled}));let industries=Array.isArray(s.industries)?s.industries:DEFAULT_INDUSTRIES;industries=[...new Set([...industries,...s.rows.map(r=>r.values?.industry||'')].map(v=>String(v||'').trim()).filter(Boolean))].slice(0,120);return {...s,columns:cols,rows:s.rows.map(r=>({...r,id:String(r.id||uid()),values:{...(r.values||{})}})),trashRows:Array.isArray(s.trashRows)?s.trashRows.filter(x=>x&&x.row?.id&&Number.isFinite(Date.parse(x.deletedAt))).slice(0,100000):[],industries};}
function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open('wwtt-mobile-clientdesk-v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('data');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbRead(){return new Promise((resolve,reject)=>{const req=db.transaction('data','readonly').objectStore('data').get('main');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function dbWrite(value){return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(value,'main');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
let writeQueue=Promise.resolve();
function localRecord(snapshot=state,localDirty=dirty){const remember=!!$('rememberKey')?.checked;return {snapshot:structuredClone(snapshot),dirty:localDirty,remember,key:remember?aesKey:null,keySalt:remember?salt:''};}
async function persist(){const record=localRecord();writeQueue=writeQueue.catch(()=>{}).then(()=>dbWrite(record));await writeQueue;}
async function changed(){localChangeSeq++;dirty=true;await persist();renderClients();if(!aesKey||!token){status('이 기기에 저장됨 · Drive 연결 필요','warn');return;}status('로컬 저장 완료 · Drive 업로드 대기','warn');scheduleUpload();}
function scheduleUpload(delay=1200){clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>syncRound('upload').catch(e=>status(e.message,'error')),delay);}
function renderStats(){const rows=state.rows.filter(r=>!r.demo);$('stats').innerHTML=[['전체 거래처',rows.length],['계약중',rows.filter(r=>r.values.status==='계약중').length],['상담중',rows.filter(r=>r.values.status==='상담중').length],['대기',rows.filter(r=>r.values.status==='대기').length]].map(([name,n])=>`<div class="stat"><small>${name}</small><strong>${n}</strong></div>`).join('');}
function cleanPhone(raw){
 const value=String(raw||'').trim().replace(/[\s().-]/g,'');
 return /^\+?[0-9]{7,17}$/.test(value)?value:'';
}
const PHONE_SVG='<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.7 19.7 0 0 1 3.1 5.2 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.7c.13.96.37 1.9.72 2.78a2 2 0 0 1-.45 2.11L9 10.9a16 16 0 0 0 4.1 4.1l1.3-1.27a2 2 0 0 1 2.1-.46c.9.35 1.83.59 2.79.72a2 2 0 0 1 1.7 2.01Z"/></svg>';
const SMS_SVG='<svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 9 9 0 0 1-4-.9L3 21l1.8-5.6a8.5 8.5 0 1 1 16.2-3.9Z"/></svg>';
function applyTheme(mode){
 const dark=mode==='dark';document.documentElement.dataset.theme=dark?'dark':'light';writeLocal(THEME_KEY,dark?'dark':'light');
 const b=$('themeToggle');if(b){b.textContent=dark?'☀':'☾';b.title=dark?'라이트 모드':'다크 모드';b.setAttribute('aria-label',b.title);}
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',dark?'#151923':'#f8f7fe');
}
function trashRows(){return Array.isArray(state.trashRows)?state.trashRows:state.trashRows=[];}
async function trashClient(id){const i=state.rows.findIndex(r=>r.id===id);if(i<0)return;const [row]=state.rows.splice(i,1);trashRows().push({row,deletedAt:new Date().toISOString()});$('clientDialog')?.open&&$('clientDialog').close();editing=false;await changed();renderTrash();notify('거래처를 휴지통으로 이동했습니다.');}
async function restoreClient(id){const i=trashRows().findIndex(x=>x.row.id===id);if(i<0)return;const [item]=trashRows().splice(i,1);if(!state.rows.some(r=>r.id===id))state.rows.push(item.row);await changed();renderTrash();notify('거래처를 복원했습니다.');}
async function purgeClient(id){state.trashRows=trashRows().filter(x=>x.row.id!==id);await changed();renderTrash();notify('거래처를 영구 삭제했습니다.');}
function trimClientTrash(){if(!Array.isArray(state.trashRows))state.trashRows=[];const before=state.trashRows.length;state.trashRows=state.trashRows.filter(x=>Date.now()-Date.parse(x.deletedAt)<TRASH_TTL);return before!==state.trashRows.length;}
function openEventForClient(id){const row=state.rows.find(r=>r.id===id);if(!row)return;switchView('calendar');openEvent();if(!$('eventDialog').open)return;const f=$('eventForm').elements;f.client.value=id;f.summary.value=`${row.values.company||'거래처'} 일정`;f.location.value=row.values.address||'';f.type.value='work';}
async function fetchTrashCalendar(){if(!accessReady())return;const params=new URLSearchParams({privateExtendedProperty:'clientDeskInTrash=1',maxResults:'2500',singleEvents:'true'});let items=[],next='';for(let page=0;page<10;page++){if(next)params.set('pageToken',next);else params.delete('pageToken');const res=await calendarRequest('?'+params);items.push(...res.items||[]);next=res.nextPageToken||'';if(!next)break;}trashCalendarEvents=items.filter(x=>x.status!=='cancelled'&&isTrashEvent(x));}
async function purgeExpiredCalendar(){if(!accessReady()||trashBusy||Date.now()-trashSweepAt<60000)return;trashBusy=true;trashSweepAt=Date.now();try{await fetchTrashCalendar();for(const ev of [...trashCalendarEvents]){const at=Date.parse(ev.extendedProperties.private.clientDeskTrashAt);if(Number.isFinite(at)&&Date.now()-at>=TRASH_TTL){try{await calendarRequest('/'+encodeURIComponent(ev.id),{method:'DELETE'});trashCalendarEvents=trashCalendarEvents.filter(x=>x.id!==ev.id);}catch(e){console.warn('일정 휴지통 자동정리 실패',e);}}}}finally{trashBusy=false;if(currentTab==='trash')renderTrash();}}
async function trashCalendarEvent(ev){if(!ev||!accessReady()){requireGoogleFor(()=>trashCalendarEvent(ev));return;}const privateData={...(ev.extendedProperties?.private||{}),clientDeskInTrash:'1',clientDeskTrashAt:new Date().toISOString()};await calendarRequest('/'+encodeURIComponent(ev.id),{method:'PATCH',body:JSON.stringify({extendedProperties:{private:privateData}})});calendarEvents=calendarEvents.filter(x=>x.id!==ev.id);if($('eventDialog').open)$('eventDialog').close();renderCalendar();cacheCalendar().catch(()=>{});notify('일정을 휴지통으로 이동했습니다.');if(currentTab==='trash'){trashCalendarEvents.unshift({...ev,extendedProperties:{...(ev.extendedProperties||{}),private:privateData}});renderTrash();}}
async function restoreCalendarEvent(id){if(!accessReady()){requireGoogleFor(()=>restoreCalendarEvent(id));return;}await calendarRequest('/'+encodeURIComponent(id),{method:'PATCH',body:JSON.stringify({extendedProperties:{private:{clientDeskInTrash:'0',clientDeskTrashAt:null}}})});trashCalendarEvents=trashCalendarEvents.filter(x=>x.id!==id);renderTrash();calendarRefresh().catch(()=>{});notify('일정을 복원했습니다.');}
async function purgeCalendarEvent(id){if(!accessReady()){requireGoogleFor(()=>purgeCalendarEvent(id));return;}await calendarRequest('/'+encodeURIComponent(id),{method:'DELETE'});trashCalendarEvents=trashCalendarEvents.filter(x=>x.id!==id);renderTrash();notify('일정을 영구 삭제했습니다.');}
function renderTrash(){
 const buttons=$('trashKinds');if(!buttons)return;buttons.querySelectorAll('button').forEach(b=>{b.classList.toggle('active',b.dataset.kind===trashCategory);b.setAttribute('aria-pressed',String(b.dataset.kind===trashCategory));});
 const list=$('trashList');list.replaceChildren();const isClients=trashCategory==='clients';let items=isClients?trashRows():trashCalendarEvents;
 $('trashCount').textContent=items.length+'건';
 if(!items.length){list.innerHTML='<div class="empty">휴지통이 비어 있습니다.</div>';return;}
 for(const item of items){const row=isClients?item.row:item;const stamp=isClients?item.deletedAt:item.extendedProperties?.private?.clientDeskTrashAt;const days=Math.max(0,7-Math.floor((Date.now()-Date.parse(stamp))/86400000));const card=document.createElement('article');card.className='trash-card';card.innerHTML=`<div class="trash-item-text"><strong>${safe(isClients?row.values.company||'이름 없는 거래처':row.summary||'제목 없는 일정')}</strong><small>삭제: ${safe(stamp?.slice(0,10)||'날짜 미상')} · 남은 기간 ${days}일</small></div><div class="trash-item-actions"><button type="button" class="soft-btn" data-restore="${safe(isClients?row.id:row.id)}">복원</button><button type="button" class="danger-link" data-purge="${safe(row.id)}">영구 삭제</button></div>`;list.append(card);}
}
// Copy enabled fields configured in the PC column manager, especially IDs and passwords.
// Credentials are displayed only in a masked/abbreviated form; raw values are
// read from the current record ONLY after an explicit tap on a copy button.
const CREDENTIAL_COPY_SVG='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
function isSecretCopyColumn(col){return /(비밀번호|패스워드|암호|password|passwd|pwd|pw)/i.test(`${col.id} ${col.label}`);}
function credentialCopyFields(row){
 const columns=state.columns.filter(col=>col.copyEnabled && String(row.values?.[col.id]??'').length);
 // The PC controls which columns get copy buttons. Do not independently
 // expose disabled fields, and preserve the user's custom column order.
 return columns.slice(0,6);
}
function credentialStrip(row){
 const fields=credentialCopyFields(row);
 if(!fields.length)return '';
 return `<div class="credential-strip" aria-label="복사 가능한 거래처 정보">${fields.map(col=>{
   const val=String(row.values[col.id]??'');
   const secret=isSecretCopyColumn(col);
   const display=secret?'••••••':safe(val.length>32?val.slice(0,29)+'…':val);
   return `<div class="credential-item"><div class="credential-caption">${safe(col.label)}</div><div class="credential-value" title="${secret?'값 숨김':safe(val)}">${display}</div><button type="button" class="credential-copy" data-credential-row="${safe(row.id)}" data-credential-col="${safe(col.id)}" aria-label="${safe(col.label)} 복사" title="${safe(col.label)} 복사">${CREDENTIAL_COPY_SVG}<span>복사</span></button></div>`;
 }).join('')}</div>`;
}
async function copyCredential(rowId,columnId){
 const row=state.rows.find(r=>r.id===rowId),col=state.columns.find(c=>c.id===columnId);
 if(!row||!col?.copyEnabled){notify('복사할 수 없는 항목입니다.');return;}
 const value=String(row.values?.[columnId]??'');
 if(!value){notify('복사할 값이 없습니다.');return;}
 try{await navigator.clipboard.writeText(value);notify(`${col.label} 복사 완료`);}
 catch(e){notify('복사 권한을 확인하세요.');}
}
function renderClients(){
 renderStats();
 const arr=state.rows.filter(r=>!r.demo).filter(r=>(statusFilter==='전체'||r.values.status===statusFilter)&&(!industryFilter||r.values.industry===industryFilter)&&(!search||Object.values(r.values).some(v=>String(v).toLowerCase().includes(search.toLowerCase()))));
 $('clientCount').textContent=arr.length+'건';
 $('statusFilters').innerHTML=['전체',...DEFAULT_STATUS].map(st=>`<button class="chip ${statusFilter===st?'active':''}" data-status="${safe(st)}">${safe(st)}</button>`).join('');
 const sel=$('industryFilter'),current=industryFilter;sel.replaceChildren(new Option('전체 업종',''),...state.industries.map(x=>new Option(x,x)));sel.value=current;
 if(sel.value!==current){industryFilter='';sel.value='';}
 const list=$('clientList');list.replaceChildren();
 if(!arr.length){list.innerHTML='<div class="empty">표시할 거래처가 없습니다.<br>거래처를 추가하거나 필터를 변경해 주세요.</div>';return;}
 for(const r of arr){
  const v=r.values,phone=cleanPhone(v.phone);
  const card=document.createElement('article');card.className='client-card';card.dataset.row=r.id;
  card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`${String(v.company||'이름 없는 거래처')} 수정`);
  card.innerHTML=`<div class="client-card-head"><div style="min-width:0"><span class="company-name">${safe(v.company||'이름 없는 거래처')}</span><button type="button" class="client-quick-event" data-client-event="${safe(r.id)}">+ 일정</button><span class="company-sub">${safe(v.address||v.service||'주소 미등록')}</span></div><span class="pill ${v.status==='계약중'?'contract':v.status==='대기'?'wait':v.status==='종료'?'end':''}">${safe(v.status||'상태 미정')}</span></div><div class="card-info"><span class="pill">${safe(v.industry||'업종 미지정')}</span><span class="info">${safe(v.ceo||'대표자 미등록')}</span><span class="contact-group"><span class="info">${safe(v.phone||'연락처 미등록')}</span>${phone?`<a class="contact-action" href="tel:${phone}" aria-label="${safe(v.company||'거래처')} 전화 걸기" title="전화 걸기">${PHONE_SVG}<span>전화</span></a><a class="contact-action sms" href="sms:${phone}" aria-label="${safe(v.company||'거래처')} 문자 보내기" title="문자 보내기">${SMS_SVG}<span>문자</span></a>`:''}</span></div>${credentialStrip(r)}`;
  list.appendChild(card);
 }
}
function inputType(type){return ({date:'date',email:'email',tel:'tel',number:'number',currency:'number'})[type]||'text';}
function openClient(rowId=null){editId=rowId;const r=state.rows.find(x=>x.id===rowId);editing=true;$('clientModalTitle').textContent=r?'거래처 수정':'거래처 추가';$('deleteClient').hidden=!r;const fields=$('clientFields');fields.replaceChildren();for(const c of state.columns){const label=document.createElement('label');label.textContent=c.label;let field;if(c.type==='select'||c.type==='status'){field=document.createElement('select');const opts=c.id==='industry'?state.industries:c.type==='status'?DEFAULT_STATUS:(c.options||[]);field.add(new Option('선택 안 함',''));for(const x of opts)field.add(new Option(x,x));}else if(c.type==='longtext'){field=document.createElement('textarea');field.rows=3;}else{field=document.createElement('input');field.type=inputType(c.type);if(c.type==='tel')field.setAttribute('inputmode','tel');}field.name=c.id;field.value=String(r?.values?.[c.id]??'');if(c.id==='company')field.required=true;field.maxLength=20000;label.appendChild(field);if(c.copyEnabled&&r&&r.values[c.id]){const copy=document.createElement('button');copy.type='button';copy.className='inline-copy';copy.textContent='복사';copy.onclick=()=>navigator.clipboard.writeText(field.value).then(()=>notify('복사했습니다'));label.append(copy);}fields.append(label);}$('clientDialog').showModal();}
async function saveClient(e){e.preventDefault();const dialog=$('clientDialog');const values={...(state.rows.find(r=>r.id===editId)?.values||{})};const data=new FormData($('clientForm'));for(const [k,v] of data.entries())values[k]=String(v);if(!values.company?.trim()){notify('상호를 입력해 주세요.');return;}const existing=state.rows.find(r=>r.id===editId);if(existing){existing.values=values;}else state.rows.push({id:uid(),demo:false,values});dialog.close();editing=false;await changed();notify('거래처를 저장했습니다.');}
async function deleteClient(){if(!editId)return;await trashClient(editId);}
function renderIndustries(){$('industryList').replaceChildren();state.industries.forEach((name,i)=>{const div=document.createElement('div');div.className='industry-line';const label=document.createElement('strong');label.textContent=name+' · '+state.rows.filter(r=>r.values.industry===name).length+'건';div.append(label);for(const [text,act,disabled] of [['↑','up',i===0],['↓','down',i===state.industries.length-1],['이름','rename',false],['삭제','remove',false]]){const btn=document.createElement('button');btn.textContent=text;btn.dataset.act=act;btn.dataset.idx=i;btn.disabled=disabled;div.append(btn);}$('industryList').append(div);});}
async function industryAction(e){const btn=e.target.closest('[data-act]');if(!btn)return;const idx=+btn.dataset.idx,n=state.industries[idx];if(btn.dataset.act==='up'||btn.dataset.act==='down'){const to=idx+(btn.dataset.act==='up'?-1:1);[state.industries[idx],state.industries[to]]=[state.industries[to],state.industries[idx]];}else if(btn.dataset.act==='rename'){const v=prompt('업종 이름 변경',n)?.trim();if(!v||v===n)return;if(state.industries.includes(v)){notify('이미 존재하는 업종입니다.');return;}state.industries[idx]=v;for(const r of state.rows)if(r.values.industry===n)r.values.industry=v;}else if(btn.dataset.act==='remove'){if(!confirm(`「${n}」 업종을 삭제할까요? 거래처는 유지되고 업종만 비워집니다.`))return;state.industries.splice(idx,1);for(const r of state.rows)if(r.values.industry===n)r.values.industry='';}await changed();renderIndustries();}
async function industryAdd(e){e.preventDefault();const value=$('newIndustry').value.trim();if(!value)return;if(state.industries.includes(value)){notify('이미 있는 업종입니다.');return;}state.industries.push(value);$('newIndustry').value='';await changed();renderIndustries();}
function switchView(which,{initial=false}={}){
 if(!['clients','calendar','settings','trash'].includes(which))return;
 currentTab=which;writeLocal(LAST_VIEW_KEY,which);
 for(const k of ['clients','calendar','settings','trash']){$(k+'View').hidden=k!==which;$('tab'+k[0].toUpperCase()+k.slice(1)).classList.toggle('active',k===which);}
 if(which==='calendar'){renderCalendar();if(!initial&&accessReady())calendarRefresh().catch(e=>notify(e.message));}
 if(which==='clients')renderClients();
 if(which==='trash'){renderTrash();if(accessReady())purgeExpiredCalendar().then(()=>fetchTrashCalendar()).then(renderTrash).catch(e=>notify('캘린더 휴지통 조회 실패: '+e.message));}
 if(!initial)window.scrollTo({top:0,behavior:'instant'});
}
function fileDownload(name,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'}));a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},3000);}
/* Browser OAuth. A web OAuth client ID must belong to the same Google Cloud
 * project as the existing extension client and have the hosted HTTPS origin. */
function accessReady(){return !!token&&Date.now()<tokenExpires-30000;}
function clearGoogleToken(){token='';tokenExpires=0;sessionDelete(AUTH_SESSION_KEY);if(db)queueAuthWrite(()=>dbRemoveItem(AUTH_VAULT_KEY));}
function rememberGoogleToken(value,expiresIn){
 token=value;tokenExpires=Date.now()+Number(expiresIn||3600)*1000;
 const clientId=$('oauthId').value.trim();
 sessionPut(AUTH_SESSION_KEY,JSON.stringify({accessToken:token,expiresAt:tokenExpires,clientId}));
 if(db)queueAuthWrite(()=>saveEncryptedToken(token,tokenExpires,clientId));
 setAuthUI();
}
function restoreGoogleToken(){
 try{
  const data=JSON.parse(sessionGet(AUTH_SESSION_KEY));
  if(data?.clientId===readLocal(CLIENT_ID_KEY)&&typeof data.accessToken==='string'&&typeof data.expiresAt==='number'&&data.expiresAt>Date.now()+30000){
   token=data.accessToken;tokenExpires=data.expiresAt;
   return true;
  }
 }catch{}
 token='';tokenExpires=0;sessionDelete(AUTH_SESSION_KEY);return false;
}
function setAuthUI(){
 const active=accessReady();
 $('googleInfo').textContent=active?'Google 연결됨 · 현재 로그인 세션이 유지됩니다.':'Google 연결 필요 · 로그인 유효기간이 끝났으면 다시 연결하세요.';
 $('connectGoogle').textContent=active?'Google 계정 다시 연결':'Google Drive·캘린더 연결';
 if($('calConnectionHint'))$('calConnectionHint').textContent=active?'Google Calendar 연결됨 · 일정 자동 동기화':calendarEvents.length?'최근 저장된 일정 표시 중 · 최신 정보는 Google 재연결 후 확인':'Google 계정을 연결하면 일정이 표시됩니다.';
}
function ensureGoogleScript(){if(!window.google?.accounts?.oauth2)throw Error('Google 로그인 라이브러리를 불러오지 못했습니다. 인터넷 연결과 브라우저 팝업 설정을 확인하세요.');}
function connectGoogle(afterConnect=null){
 if(authInFlight){notify('Google 계정 연결 창을 확인해 주세요.');return;}
 ensureGoogleScript();const id=$('oauthId').value.trim();
 if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(id))throw Error('설정에 웹 OAuth 클라이언트 ID를 먼저 저장해 주세요.');
 authInFlight=true;
 const client=google.accounts.oauth2.initTokenClient({client_id:id,scope:SCOPE,callback:async response=>{
  authInFlight=false;
  if(response.error){status('Google 승인 실패: '+response.error,'error');notify('Google 계정 승인을 완료해 주세요.');return;}
  if(!response.access_token){status('Google 로그인 토큰을 받지 못했습니다.','error');return;}
  rememberGoogleToken(response.access_token,response.expires_in);
  status('Google 연결됨 · 세션 유효시간 동안 다시 실행해도 유지');
  if(aesKey)syncRound().catch(e=>status(e.message,'error'));
  if(typeof afterConnect==='function'){
   try{await afterConnect();}catch(e){onError(e);}
  }
  calendarRefresh().catch(e=>notify(e.message));
 },error_callback:()=>{authInFlight=false;status('Google 로그인 팝업이 닫히거나 차단되었습니다.','error');notify('Google 계정 연결이 취소되었습니다.');}});
 try{client.requestAccessToken({prompt:''});}catch(e){authInFlight=false;throw e;}
}
function requireGoogleFor(action){
 if(accessReady())return action();
 try{
  notify('Google 연결을 갱신한 뒤 이 작업을 이어갑니다.');
  connectGoogle(action);
 }catch(e){notify(e.message);}
}

async function driveRequest(url,options={}){
 if(!accessReady()){clearGoogleToken();setAuthUI();throw Error('Google 연결 시간이 만료되었습니다. Google 계정을 다시 연결하세요.');}
 const response=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`},cache:'no-store'});
 if(response.status===401){clearGoogleToken();setAuthUI();throw Error('Google 인증이 만료되었습니다. 다시 연결해 주세요.');}
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
 if(!accessReady())throw Error('Google 연결이 만료되었습니다. 설정에서 계정을 다시 연결하세요.');
 const res=await fetch(CAL_API+path,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})},cache:'no-store'});
 if(res.status===401){clearGoogleToken();setAuthUI();throw Error('Google 인증 만료 · 다시 연결해 주세요.');}
 if(!res.ok)throw Error('Google Calendar 오류 '+res.status+': '+(await res.text()).slice(0,140));
 return res.status===204?{}:res.json();
}
function timeOf(ev){if(ev.start?.date)return '종일';const d=new Date(ev.start?.dateTime);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false});}
function evDay(ev){return ev.start?.date||dateLocal(new Date(ev.start?.dateTime));}
function eventDays(ev){
 const start=ev.start?.date|| (ev.start?.dateTime?dateLocal(new Date(ev.start.dateTime)):'');
 if(!start)return [];
 const allDay=!!ev.start?.date;
 const end=allDay?(ev.end?.date||addDays(start,1)):(ev.end?.dateTime?dateLocal(new Date(new Date(ev.end.dateTime).getTime()-1)):addDays(start,1));
 const days=[];let d=start;
 for(let i=0;i<100&&d<=(allDay?addDays(end,-1):end);i++,d=addDays(d,1))days.push(d);
 return days.length?days:[start];
}
function eventDone(ev){return ev.extendedProperties?.private?.clientDeskDone==='1';}
// Same priority as PC: unfinished entries above finished ones, with
// chronological ordering preserved *within each group*.
function calendarEventStartMs(ev){
 const start=ev.start?.dateTime||ev.start?.date;
 if(!start)return Number.POSITIVE_INFINITY;
 const ms=Date.parse(ev.start?.date?start+'T00:00:00':start);
 return Number.isFinite(ms)?ms:Number.POSITIVE_INFINITY;
}
function calendarPriorityOrder(a,b){
 const doneA=eventDone(a),doneB=eventDone(b);
 if(doneA!==doneB)return doneA?1:-1;
 const msA=calendarEventStartMs(a),msB=calendarEventStartMs(b);
 return msA-msB||String(a.summary||'').localeCompare(String(b.summary||''),'ko');
}
function eventsOn(date){return calendarEvents.filter(ev=>eventDays(ev).includes(date)).sort(calendarPriorityOrder);}
function setCalendarExpanded(next){calendarExpanded=!!next;writeLocal(CALENDAR_MODE_KEY,calendarExpanded?'1':'0');renderCalendar();}
async function cacheCalendar(){
 if(!db)return;
 const record={items:calendarEvents,checkedAt:Date.now()};calendarCacheStamp=record.checkedAt;
 await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(record,CALENDAR_CACHE_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
}
async function restoreCalendarCache(){
 if(!db)return;
 const record=await new Promise((resolve,reject)=>{const req=db.transaction('data','readonly').objectStore('data').get(CALENDAR_CACHE_KEY);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
 if(Array.isArray(record?.items)&&record.items.length<=15000){calendarEvents=record.items;calendarCacheStamp=Number(record.checkedAt)||0;}
}
async function calendarRefresh(){
 if(!accessReady()){setAuthUI();return;}
 const seq=++calendarRequestSeq;
 const start=new Date(calMonth.getFullYear(),calMonth.getMonth(),-7).toISOString(),end=new Date(calMonth.getFullYear(),calMonth.getMonth()+2,7).toISOString();
 const query=new URLSearchParams({timeMin:start,timeMax:end,singleEvents:'true',maxResults:'2500'});
 let events=[],next='';
 for(let p=0;p<5;p++){if(next)query.set('pageToken',next);const result=await calendarRequest('?'+query);events.push(...(result.items||[]));next=result.nextPageToken||'';if(!next)break;}
 if(seq!==calendarRequestSeq)return;
 calendarEvents=events.filter(ev=>ev.status!=='cancelled'&&!isTrashEvent(ev));renderCalendar();setAuthUI();
 cacheCalendar().catch(e=>console.warn('일정 캐시 저장 실패',e));purgeExpiredCalendar().catch(e=>console.warn('휴지통 자동 정리 실패',e));
}
function renderCalendar(){
 $('monthTitle').textContent=`${calMonth.getFullYear()}년 ${calMonth.getMonth()+1}월`;
 const grid=$('monthGrid');grid.replaceChildren();grid.classList.toggle('expanded',calendarExpanded);
 const expandBtn=$('toggleCalendar');expandBtn.textContent=calendarExpanded?'달력 접기':'달력 펼치기';expandBtn.setAttribute('aria-expanded',String(calendarExpanded));
 $('calendarGrip').setAttribute('aria-label',calendarExpanded?'달력 접기':'달력 펼치기');
 const byDate=new Map();for(const ev of calendarEvents){for(const d of eventDays(ev)){if(!byDate.has(d))byDate.set(d,[]);byDate.get(d).push(ev);}}
 for(const dayEvents of byDate.values())dayEvents.sort(calendarPriorityOrder);
 for(const wd of ['일','월','화','수','목','금','토']){const e=document.createElement('div');e.className='weekday';e.textContent=wd;grid.append(e);}
 const begin=new Date(calMonth.getFullYear(),calMonth.getMonth(),1-calMonth.getDay());
 for(let i=0;i<42;i++){
  const d=new Date(begin.getFullYear(),begin.getMonth(),begin.getDate()+i),date=dateLocal(d),items=byDate.get(date)||[];
  const btn=document.createElement('button');btn.type='button';const holiday=window.WWTT_HOLIDAYS?.[date]||'';
  btn.className='day-cell'+(d.getMonth()!==calMonth.getMonth()?' dim':'')+(selectedDay===date?' selected':'')+(holiday?' holiday':'');btn.dataset.day=date;
  const agenda=calendarExpanded?`<div class="agenda-list">${items.slice(0,3).map(ev=>`<span class="agenda-item ${eventDone(ev)?'done':''}" title="${safe(ev.summary||'일정')}">${safe(ev.summary||'일정')}</span>`).join('')}${items.length>3?`<span class="agenda-more">+${items.length-3}</span>`:''}</div>`:(items.length?`<span class="calendar-dots" aria-label="일정 ${items.length}건">${'<b></b>'.repeat(Math.min(items.length,3))}</span>`:'');
  btn.innerHTML=`<span class="day-number">${d.getDate()}</span>${holiday?'<em>'+safe(holiday)+'</em>':''}${agenda}`;
  grid.append(btn);
 }
 renderDayEvents();setAuthUI();
}
function renderDayEvents(){
 $('selectedDateLabel').textContent=selectedDay;$('dayEvents').replaceChildren();
 const arr=eventsOn(selectedDay);
 if(!arr.length){$('dayEvents').innerHTML='<div class="empty">선택한 날짜의 일정이 없습니다.<br>+ 일정 버튼으로 새 일정을 추가해 주세요.</div>';return;}
 for(const ev of arr){
  const div=document.createElement('div'),done=eventDone(ev);div.className='event-card'+(done?' completed':'');
  const title=document.createElement('div');title.className='event-card-text';
  title.innerHTML=`<strong>${safe(ev.summary||'제목 없음')}</strong><small>${safe(timeOf(ev))} · ${safe(ev.location||'장소 없음')}</small>`;
  const actions=document.createElement('div');actions.className='event-actions';
  for(const [label,action] of [[done?'완료 취소':'✓ 완료','done'],['수정','edit'],['복사','copy'],['삭제','trash']]){
   const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.eventId=ev.id;btn.dataset.action=action;
   if(action==='done'){btn.className='event-done';btn.setAttribute('aria-pressed',String(done));btn.disabled=eventPending.has(ev.id);}
   actions.append(btn);
  }
  div.append(title,actions);$('dayEvents').append(div);
 }
}
async function toggleDone(ev){
 if(eventPending.has(ev.id))return;
 if(!accessReady()){requireGoogleFor(()=>toggleDone(ev));return;}
 eventPending.add(ev.id);renderDayEvents();
 const next=!eventDone(ev);
 try{
  const props={...(ev.extendedProperties?.private||{}),clientDeskDone:next?'1':'0'};
  await calendarRequest('/'+encodeURIComponent(ev.id),{method:'PATCH',body:JSON.stringify({extendedProperties:{private:props}})});
  ev.extendedProperties={...(ev.extendedProperties||{}),private:props};renderCalendar();
  notify(next?'일정 완료 처리했습니다.':'일정을 미완료로 되돌렸습니다.');
  calendarRefresh().catch(e=>notify('완료 상태 저장됨 · 갱신 확인 실패: '+e.message));
 }finally{eventPending.delete(ev.id);renderDayEvents();}
}
function openEvent(ev=null,copy=false){if(!accessReady()){requireGoogleFor(()=>openEvent(ev,copy));return;}eventId=ev&&!copy?ev.id:null;eventSource=ev&&!copy?ev:null;$('eventModalTitle').textContent=copy?'일정 복사':ev?'일정 수정':'새 일정';$('deleteEvent').hidden=!eventId;const form=$('eventForm');form.reset();form.elements.summary.value=ev?.summary||'';form.elements.date.value=ev?evDay(ev):selectedDay;const isAllDay=!!ev?.start?.date;form.elements.allDay.checked=isAllDay;form.elements.start.disabled=isAllDay;form.elements.end.disabled=isAllDay;form.elements.endDate.value=ev?(ev.end?.date?addDays(ev.end.date,-1):dateLocal(new Date(ev.end?.dateTime||ev.start?.dateTime))):selectedDay;const at=ev?.start?.dateTime?new Date(ev.start.dateTime):null,until=ev?.end?.dateTime?new Date(ev.end.dateTime):null;const hhmm=d=>d?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:null;form.elements.start.value=hhmm(at)||'09:00';form.elements.end.value=hhmm(until)||'10:00';form.elements.location.value=ev?.location||'';form.elements.description.value=ev?.description||'';form.elements.type.value=ev?.extendedProperties?.private?.clientDeskType||'personal';form.elements.color.value=['white','green','yellow','pink','lavender','iceblue'].includes(ev?.extendedProperties?.private?.clientDeskColor)?ev.extendedProperties.private.clientDeskColor:'white';$('eventClient').replaceChildren(new Option('연결 안 함',''),...state.rows.filter(r=>!r.demo&&r.values.company).map(r=>new Option(r.values.company,r.id)));$('eventClient').value=ev?.extendedProperties?.private?.clientDeskClientId||'';$('eventDialog').showModal();}
async function eventSubmit(e){e.preventDefault();if(!accessReady()){requireGoogleFor(()=>eventSubmit(e));return;}const f=$('eventForm').elements;const day=f.date.value,endDay=f.endDate.value,start=f.start.value,end=f.end.value,isAllDay=f.allDay.checked;if(!day||!endDay||(isAllDay?endDay<day:(new Date(`${endDay}T${end}:00+09:00`)<=new Date(`${day}T${start}:00+09:00`)))){notify('올바른 시작·종료 날짜와 시간을 입력하세요.');return;}const selectedClient=state.rows.find(r=>r.id===f.client.value);const patch={summary:f.summary.value.trim(),description:f.description.value,location:f.location.value,start:isAllDay?{date:day}:{dateTime:`${day}T${start}:00+09:00`,timeZone:'Asia/Seoul'},end:isAllDay?{date:addDays(endDay,1)}:{dateTime:`${endDay}T${end}:00+09:00`,timeZone:'Asia/Seoul'}};if(!patch.summary){notify('제목을 입력해 주세요.');return;}const props={...(eventSource?.extendedProperties?.private||{}),clientDeskApp:'1',clientDeskType:f.type.value,clientDeskColor:f.color.value};if(selectedClient){props.clientDeskClientId=selectedClient.id;props.clientDeskClientName=selectedClient.values.company;}else{delete props.clientDeskClientId;delete props.clientDeskClientName;}patch.extendedProperties={private:props};const btn=f.querySelector?.('button')||$('eventForm').querySelector('[type="submit"]');if(btn)btn.disabled=true;try{await calendarRequest(eventId?'/'+encodeURIComponent(eventId):'',{method:eventId?'PATCH':'POST',body:JSON.stringify(patch)});$('eventDialog').close();notify('Google 캘린더에 저장했습니다.');await calendarRefresh();}finally{if(btn)btn.disabled=false;}}
async function eventDelete(){if(!eventId)return;const ev=calendarEvents.find(x=>x.id===eventId)||eventSource;if(ev)await trashCalendarEvent(ev);}
function onError(e){console.error(e);notify(e?.message||'처리 중 오류가 발생했습니다.');}
function bind(){
 document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>switchView(btn.dataset.view)));
 $('headerSync').addEventListener('click',()=>syncRound().catch(onError));
 $('themeToggle').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
 $('trashKinds').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(b){trashCategory=b.dataset.kind;renderTrash();}});
 $('trashList').addEventListener('click',e=>{const restore=e.target.closest('[data-restore]'),purge=e.target.closest('[data-purge]');if(restore)(trashCategory==='clients'?restoreClient(restore.dataset.restore):restoreCalendarEvent(restore.dataset.restore)).catch(onError);else if(purge)(trashCategory==='clients'?purgeClient(purge.dataset.purge):purgeCalendarEvent(purge.dataset.purge)).catch(onError);});
 $('statusFilters').addEventListener('click',e=>{const b=e.target.closest('[data-status]');if(b){statusFilter=b.dataset.status;renderClients();}});
 $('industryFilter').addEventListener('change',e=>{industryFilter=e.target.value;renderClients();});
 $('clientSearch').addEventListener('input',e=>{search=e.target.value;renderClients();});
 $('clientList').addEventListener('click',e=>{const copy=e.target.closest('[data-credential-row]');if(copy){copyCredential(copy.dataset.credentialRow,copy.dataset.credentialCol).catch(onError);return;}const schedule=e.target.closest('[data-client-event]');if(schedule){openEventForClient(schedule.dataset.clientEvent);return;}if(e.target.closest('a,button'))return;const b=e.target.closest('[data-row]');if(b)openClient(b.dataset.row);});
 $('clientList').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-row]')){e.preventDefault();openClient(e.target.dataset.row);}});
 $('addClient').addEventListener('click',()=>openClient());
 $('clientForm').addEventListener('submit',e=>saveClient(e).catch(onError));
 $('deleteClient').addEventListener('click',()=>deleteClient().catch(onError));
 $('clientDialog').addEventListener('close',()=>{editing=false;if(aesKey&&!syncBusy&&accessReady())syncRound().catch(onError);});
 $('manageIndustries').addEventListener('click',()=>{renderIndustries();$('industryDialog').showModal();});
 $('industryAddForm').addEventListener('submit',e=>industryAdd(e).catch(onError));
 $('industryList').addEventListener('click',e=>industryAction(e).catch(onError));
 document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>$(b.dataset.close).close()));
 $('rememberKey').addEventListener('change',()=>persist().catch(onError));
 $('saveOAuth').addEventListener('click',()=>{const id=$('oauthId').value.trim();if(!/^\d+-[\w-]+\.apps\.googleusercontent\.com$/.test(id)){notify('올바른 웹 OAuth 클라이언트 ID를 입력하세요.');return;}if(id!==readLocal(CLIENT_ID_KEY)){clearGoogleToken();setAuthUI();}writeLocal(CLIENT_ID_KEY,id);notify('웹 OAuth 클라이언트 ID를 저장했습니다.');});
 $('connectGoogle').addEventListener('click',()=>{try{connectGoogle();}catch(e){onError(e);}});
 $('connectDrive').addEventListener('click',()=>connectDrive().catch(onError));
 $('syncNow').addEventListener('click',()=>syncRound().catch(onError));
 $('loadCloud').addEventListener('click',()=>forceCloud().catch(onError));
 $('exportJson').addEventListener('click',exportData);
 $('importJson').addEventListener('click',()=>$('importFile').click());
 $('importFile').addEventListener('change',e=>importData(e.target.files?.[0]).catch(onError));
 $('checkUpdate').addEventListener('click',()=>checkUpdates(true).catch(onError));
 $('prevMonth').addEventListener('click',()=>shiftCalendarMonth(-1));
 $('nextMonth').addEventListener('click',()=>shiftCalendarMonth(1));
 $('todayMonth').addEventListener('click',()=>{calMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);selectedDay=dateLocal(new Date());saveCalendarPosition();renderCalendar();if(accessReady())calendarRefresh().catch(onError);});
 const monthGrid=$('monthGrid');
 monthGrid.addEventListener('click',e=>{if(Date.now()<calendarSwipeSuppressUntil){e.preventDefault();return;}const b=e.target.closest('[data-day]');if(b){selectedDay=b.dataset.day;saveCalendarPosition();renderCalendar();}});
 let swipe=null;
 monthGrid.addEventListener('pointerdown',e=>{if(e.isPrimary===false||e.button!==0)return;swipe={x:e.clientX,y:e.clientY,id:e.pointerId};});
 monthGrid.addEventListener('pointerup',e=>{
  if(!swipe||swipe.id!==e.pointerId)return;
  const dx=e.clientX-swipe.x,dy=e.clientY-swipe.y;swipe=null;
  if(Math.abs(dx)<48||Math.abs(dx)<Math.abs(dy)*1.35)return;
  calendarSwipeSuppressUntil=Date.now()+450;
  shiftCalendarMonth(dx<0?1:-1);
 });
 monthGrid.addEventListener('pointercancel',()=>{swipe=null;});
 $('addEvent').addEventListener('click',()=>openEvent());
 $('dayEvents').addEventListener('click',e=>{const b=e.target.closest('[data-event-id]');if(!b)return;const ev=calendarEvents.find(x=>x.id===b.dataset.eventId);if(!ev)return;if(b.dataset.action==='done')toggleDone(ev).catch(onError);else if(b.dataset.action==='trash')trashCalendarEvent(ev).catch(onError);else openEvent(ev,b.dataset.action==='copy');});
 $('toggleCalendar').addEventListener('click',()=>setCalendarExpanded(!calendarExpanded));
 const grip=$('calendarGrip');let touchStart=null;
 grip.addEventListener('pointerdown',e=>{touchStart=e.clientY;try{grip.setPointerCapture(e.pointerId);}catch{}});
 grip.addEventListener('pointerup',e=>{if(touchStart===null)return;const delta=e.clientY-touchStart;touchStart=null;if(Math.abs(delta)>22)setCalendarExpanded(delta>0);else setCalendarExpanded(!calendarExpanded);});
 grip.addEventListener('pointercancel',()=>{touchStart=null;});
 $('eventForm').addEventListener('submit',e=>eventSubmit(e).catch(onError));
 $('eventForm').elements.allDay.addEventListener('change',e=>{for(const name of ['start','end'])$('eventForm').elements[name].disabled=e.target.checked;});
 $('deleteEvent').addEventListener('click',()=>eventDelete().catch(onError));
 window.addEventListener('online',()=>{if(aesKey&&accessReady())syncRound().catch(onError);if(accessReady())calendarRefresh().catch(onError);});
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
 try{await restoreCalendarCache();}catch(e){console.warn('달력 캐시 복구 실패',e);}
 if(trimClientTrash())await changed();
 applyTheme(readLocal(THEME_KEY));
 restoreNavigation();
 let hasSession=restoreGoogleToken();
 if(!hasSession)hasSession=await restoreEncryptedToken();
 renderClients();renderCalendar();bind();switchView(currentTab,{initial:true});setAuthUI();status(hasSession?'Google 연결 복구 완료 · 일정 확인 중':dirty?'휴대폰에 저장됨 · PC 동기화 대기':'모바일 거래처 관리 준비 완료',dirty?'warn':hasSession?'ok':'idle');document.body.classList.add('js-ready');
 if(hasSession){calendarRefresh().catch(e=>notify('캘린더 갱신 실패: '+e.message));if(aesKey)syncRound().catch(e=>status(e.message,'error'));}
 registerSW().catch(e=>console.warn('PWA SW registration',e));
}
init();
})();
