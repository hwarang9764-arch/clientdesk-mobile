/* Client Desk review credentials — independent, encrypted local vault.
   Never place credential values in data-* attributes or HTML. */
(()=>{'use strict';
  if(window.__cdReviewVault23)return;window.__cdReviewVault23=true;
  const isMobile=!!document.getElementById('tabClients');
  const mount=document.querySelector(isMobile?'.app-shell > main':'.workspace-content') || (isMobile?document.querySelector('.app-shell main'):document.getElementById('clientsPage')?.parentElement);
  const nav=isMobile?document.querySelector('.bottom-nav'):document.querySelector('.side-navigation');
  if(!mount||!nav)return;
  const DATABASE='wwtt-clientdesk-review-vault-v1', OBJECT='vault';
  const $=(id)=>document.getElementById(id);
  let db=null,key=null,items=[],activeId=null,busy=false;
  const unique=()=>crypto.randomUUID?.()||('review-'+Date.now()+'-'+Math.random().toString(36).slice(2));
  const fail=(e)=>{console.error('Review account vault:',e);message(e?.message||'처리 중 오류가 발생했습니다.',true);};
  const LOCK_ICON="<svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" aria-hidden=\"true\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"1.9\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"5\" y=\"10\" width=\"14\" height=\"11\" rx=\"2\"/><path d=\"M8 10V7a4 4 0 0 1 8 0v3\"/></svg>";
  const GRIP_ICON="<svg viewBox=\"0 0 24 24\" width=\"20\" height=\"20\" fill=\"currentColor\" aria-hidden=\"true\"><circle cx=\"9\" cy=\"5\" r=\"1.4\"/><circle cx=\"15\" cy=\"5\" r=\"1.4\"/><circle cx=\"9\" cy=\"12\" r=\"1.4\"/><circle cx=\"15\" cy=\"12\" r=\"1.4\"/><circle cx=\"9\" cy=\"19\" r=\"1.4\"/><circle cx=\"15\" cy=\"19\" r=\"1.4\"/></svg>";
  // Identical copy SVG to the mobile client-management credential button.
  const RV_COPY_SVG='<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const RV_EYE_SVG='<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M2.1 12s3.7-6 9.9-6 9.9 6 9.9 6-3.7 6-9.9 6-9.9-6-9.9-6Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const RV_EYE_OFF_SVG='<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M10.7 5.9A10.6 10.6 0 0 1 12 5.8c6.2 0 9.9 6.2 9.9 6.2a16.8 16.8 0 0 1-3.1 3.5"/><path d="M6.1 6.2A16.8 16.8 0 0 0 2.1 12S5.8 18 12 18a10.3 10.3 0 0 0 4.1-.8"/><path d="M10.5 10.5a2.2 2.2 0 0 0 3 3"/><path d="M3 3l18 18"/></svg>';
  const btn=document.createElement('button');btn.type='button';btn.id='rvNav';
  if(isMobile){btn.className='tab rv-tab';btn.innerHTML=`<span aria-hidden="true">${LOCK_ICON}</span><small>리뷰계정</small>`;btn.dataset.view='reviewAccounts';nav.insertBefore(btn,$('tabTrash'));}
  else{btn.className='side-nav';btn.innerHTML=`<span class="nav-icon" aria-hidden="true">${LOCK_ICON}</span><span>리뷰 계정 관리</span>`;const cl=$('navClients');cl.parentNode.insertBefore(btn,cl.nextSibling);}
  const page=document.createElement(isMobile?'section':'main');page.id=isMobile?'reviewView':'reviewPage';page.hidden=true;
  page.className=isMobile?'view rv-page':'main-content rv-page';
  page.innerHTML=`<div class="rv-top"><div><p class="eyebrow">REVIEW ACCOUNT MANAGEMENT</p><h1>리뷰 계정 관리</h1><p class="rv-muted">명의자별 로그인 정보와 인증용 연락처를 관리합니다. 손잡이를 드래그해 순서를 바꿀 수 있습니다.</p></div><button type="button" class="rv-primary" id="rvAdd">+ 계정 추가</button></div>
    <div class="rv-tools"><input id="rvSearch" type="search" placeholder="명의자·ID·휴대폰번호 검색" aria-label="리뷰 계정 검색" autocomplete="off"><span id="rvCount">0건</span></div>
    <div class="rv-cloud-actions" aria-label="리뷰 계정 Google Drive 연결과 동기화"><div class="rv-cloud-buttons"><button type="button" id="rvGoogleConnect" class="rv-muted-btn">Google 계정 연결</button><button type="button" id="rvCloudSync" class="rv-primary">↻ 지금 동기화</button></div><div class="rv-google-state" id="rvGoogleState" aria-live="polite">Google 연결 확인 중…</div><span id="rvCloudInfo" aria-live="polite">리뷰 계정은 암호화해 Google Drive와 동기화합니다.</span></div><div class="rv-list" id="rvList"></div><p class="rv-privacy">🔒 비밀번호는 기기에 암호화 저장하며 Google Drive에는 암호화된 내용만 전송합니다. 기존 거래처 동기화 PIN과 같은 Google 계정을 사용합니다.</p><p class="rv-status" id="rvStatus" role="status" aria-live="polite"></p>`;
  // Mobile: keep the title and add-account button on one row; the search field
  // takes the place of the obsolete help paragraph without duplicating controls.
  if(isMobile){
    const top=page.querySelector('.rv-top');
    const info=top?.firstElementChild;
    const heading=info?.querySelector('h1');
    const add=page.querySelector('#rvAdd');
    const search=page.querySelector('.rv-tools');
    if(info&&heading&&add&&search){
      const row=document.createElement('div');row.className='rv-title-line';
      heading.replaceWith(row);row.append(heading,add);
      info.querySelector('.rv-muted')?.remove();
      info.append(search);
      top.classList.add('rv-top-mobile');
    }
  }
  if(isMobile)mount.insertBefore(page,$('settingsView'));else mount.appendChild(page);
  const modal=document.createElement('dialog');modal.id='rvDialog';modal.className='rv-dialog';
  modal.innerHTML=`<form id="rvForm" autocomplete="off"><div class="rv-modal-heading"><h2 id="rvDialogTitle">리뷰 계정 추가</h2><button type="button" class="rv-close" id="rvClose" aria-label="닫기">×</button></div>
    <div class="rv-body"><label>명의자 <span aria-hidden="true">*</span><input id="rvOwner" maxlength="90" required autocomplete="off" placeholder="명의자 이름"></label>
    <label>ID <span aria-hidden="true">*</span><div class="rv-field-action"><input id="rvLogin" maxlength="160" required autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="리뷰 관리용 아이디"><button type="button" class="rv-icon-btn" data-fieldcopy="rvLogin" aria-label="ID 복사" title="ID 복사">${RV_COPY_SVG}</button></div></label>
    <label>PW <span aria-hidden="true">*</span><div class="rv-field-action"><input id="rvPassword" type="password" maxlength="300" required autocomplete="new-password" spellcheck="false" placeholder="비밀번호"><button type="button" class="rv-icon-btn" id="rvReveal" aria-label="비밀번호 보기" title="비밀번호 보기">${RV_EYE_SVG}</button><button type="button" class="rv-icon-btn" data-fieldcopy="rvPassword" aria-label="PW 복사" title="PW 복사">${RV_COPY_SVG}</button></div></label>
    <label>인증용 휴대폰번호<div class="rv-field-action"><input id="rvPhone" type="tel" inputmode="tel" maxlength="40" autocomplete="off" placeholder="010-0000-0000"><button type="button" class="rv-icon-btn" data-fieldcopy="rvPhone" aria-label="휴대폰번호 복사" title="휴대폰번호 복사">${RV_COPY_SVG}</button></div></label></div>
    <div class="rv-actions"><button type="button" id="rvDelete" class="rv-danger" hidden>삭제</button><button type="button" class="rv-muted-btn" id="rvCancel">취소</button><button type="submit" class="rv-primary" id="rvSave">저장하기</button></div></form>`;
  document.body.appendChild(modal);
  function message(t,error=false){const s=$('rvStatus');if(s){s.textContent=t;s.classList.toggle('rv-error',!!error);}}
  const rw=(mode,fn)=>new Promise((resolve,reject)=>{const tx=db.transaction(OBJECT,mode),store=tx.objectStore(OBJECT);let val;try{val=fn(store);}catch(e){reject(e);return;}let out;val.onsuccess=()=>out=val.result;tx.oncomplete=()=>resolve(out);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('저장 작업이 취소되었습니다.'));});
  async function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DATABASE,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(OBJECT))req.result.createObjectStore(OBJECT);};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
  function b64(bytes){let result='';for(let i=0;i<bytes.length;i+=4096)result+=String.fromCharCode(...bytes.slice(i,i+4096));return btoa(result);}
  function from64(str){return Uint8Array.from(atob(str),x=>x.charCodeAt(0));}
  async function initVault(){
    if(!window.isSecureContext||!crypto?.subtle)throw Error('이 브라우저에서는 안전한 암호화 저장소를 사용할 수 없습니다.');
    db=await openDb();key=await rw('readonly',store=>store.get('key'));
    if(!key){const candidate=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);await rw('readwrite',store=>store.put(candidate,'key'));key=candidate;}
    const stored=await rw('readonly',store=>store.get('records'));
    if(stored){if(stored.version!==1||!stored.iv||!stored.cipher)throw Error('기존 리뷰 계정 데이터 형식을 확인할 수 없습니다.');
      const buffer=await crypto.subtle.decrypt({name:'AES-GCM',iv:from64(stored.iv)},key,from64(stored.cipher));
      const parsed=JSON.parse(new TextDecoder().decode(buffer));if(!Array.isArray(parsed))throw Error('리뷰 계정 데이터에 오류가 있습니다.');items=safeRecords(parsed);
    }
    render();message('암호화 보관함 준비 완료');
    if(syncOnVaultReady){syncOnVaultReady=false;syncReviewCloud(true).catch(fail);}
    else queueCloud(1250);
  }
  async function saveVault(sendToCloud=true){
    if(!db||!key)throw Error('암호화 저장소를 준비하지 못했습니다.');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(items)));
    await rw('readwrite',store=>store.put({version:1,iv:b64(iv),cipher:b64(new Uint8Array(encrypted))},'records'));if(sendToCloud){changeCounter++;queueCloud(800);}
  }
  function el(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
  function action(label,title,fn,kind=''){const b=el('button','rv-action '+kind,label);b.type='button';b.title=title;b.addEventListener('click',fn);return b;}
  async function copy(value,label){if(!value){message('복사할 값이 없습니다.',true);return;}try{await navigator.clipboard.writeText(value);message(label+' 복사 완료');}catch{message('클립보드 접근을 허용해 주세요.',true);}}
  function iconButton(svg,label,onClick,extra=''){
    const button=action('',label,onClick,'rv-icon-action '+extra);
    button.setAttribute('aria-label',label);
    button.innerHTML=svg;
    return button;
  }
  function reviewField(label,value,maskValue,initiallyVisible=false){
    const row=el('div','rv-row');
    const fieldLabel=el('small','rv-label',label);
    const display=el('span','rv-value',initiallyVisible?value:maskValue);
    let exposed=initiallyVisible;
    const visibility=iconButton(exposed?RV_EYE_OFF_SVG:RV_EYE_SVG,`${label} ${exposed?'숨기기':'보기'}`,()=>{
      exposed=!exposed;
      display.textContent=exposed?(value||'미등록'):maskValue;
      visibility.innerHTML=exposed?RV_EYE_OFF_SVG:RV_EYE_SVG;
      visibility.title=`${label} ${exposed?'숨기기':'보기'}`;
      visibility.setAttribute('aria-label',visibility.title);
      visibility.setAttribute('aria-pressed',String(exposed));
    },'rv-eye-action');
    visibility.setAttribute('aria-pressed',String(exposed));
    const copyButton=iconButton(RV_COPY_SVG,`${label} 복사`,()=>copy(value,label),'rv-copy-action');
    row.append(fieldLabel,display,visibility,copyButton);
    return row;
  }
  function render(){const root=$('rvList');if(!root)return;root.replaceChildren();const q=$('rvSearch').value.trim().toLowerCase();const filtered=visibleItems().filter(o=>[o.owner,o.login,o.phone].some(s=>String(s||'').toLowerCase().includes(q)));$('rvCount').textContent=`${filtered.length}건`;
    if(!filtered.length){root.append(el('div','rv-empty',q?'검색 결과가 없습니다.':'저장된 리뷰 계정이 없습니다. + 계정 추가를 눌러주세요.'));return;}
    for(const item of filtered){const card=el('article','rv-card');card.dataset.rvId=item.id;const title=el('div','rv-card-top');const dragHandle=el('button','rv-drag-handle');dragHandle.type='button';dragHandle.innerHTML=GRIP_ICON;dragHandle.title='드래그하여 순서 변경 · 키보드 위아래 화살표 지원';dragHandle.setAttribute('aria-label',item.owner+' 순서 이동');title.append(dragHandle,el('strong','rv-owner',item.owner),action('수정','계정 수정',()=>edit(item.id)));
      card.append(title);
      card.append(reviewField('ID',item.login,'••••••••',true));
      card.append(reviewField('PW',item.password,'••••••••'));
      const masked=item.phone?item.phone.replace(/\d(?=\d{4})/g,'•'):'미등록';
      card.append(reviewField('인증번호',item.phone,masked));
      root.append(card);
    }
  }
  function edit(id=null){if(!key){message('암호화 저장소를 준비 중입니다.',true);return;}activeId=id;const item=items.find(x=>x.id===id&&!x.deletedAt)||{};$('rvDialogTitle').textContent=id?'리뷰 계정 수정':'리뷰 계정 추가';$('rvOwner').value=item.owner||'';$('rvLogin').value=item.login||'';$('rvPassword').value=item.password||'';$('rvPhone').value=item.phone||'';$('rvPassword').type='password';$('rvReveal').innerHTML=RV_EYE_SVG;$('rvReveal').setAttribute('aria-label','비밀번호 보기');$('rvReveal').setAttribute('aria-pressed','false');$('rvDelete').hidden=!id;modal.showModal();}
  const reviewLastKey='wwtt_mobile_review_last_view_v1';
  function openPage(){
    if(isMobile)try{localStorage.setItem(reviewLastKey,'reviewAccounts');}catch{}
    if(isMobile)updateReviewGoogleUI();
    if(isMobile){for(const section of document.querySelectorAll('.app-shell > main > .view'))section.hidden=section!==page;document.querySelectorAll('.bottom-nav .tab').forEach(tab=>tab.classList.toggle('active',tab===btn));document.body.classList.remove('cd-calendar-visible');}
    else {for(const node of mount.children)if(node.classList?.contains('main-content'))node.hidden=node!==page;document.querySelectorAll('.side-nav').forEach(b=>b.classList.toggle('active',b===btn));}
    page.hidden=false;render();
  }
  btn.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openPage();},true);
  if(isMobile)nav.addEventListener('click',event=>{if(!event.target.closest('#rvNav')&&event.target.closest('.tab')){page.hidden=true;try{localStorage.removeItem(reviewLastKey);}catch{}}},true);
  if(isMobile){const last=(()=>{try{return localStorage.getItem(reviewLastKey);}catch{return null;}})();if(last==='reviewAccounts'){let tries=0;const restore=()=>{if(document.body.classList.contains('js-ready')){openPage();return;}if(++tries<120)setTimeout(restore,75);};setTimeout(restore,50);}}
  else document.addEventListener('click',event=>{if(event.target.closest('.side-nav:not(#rvNav)'))page.hidden=true;},true);

  // Ordering is stored inside the existing AES-GCM encrypted review-account records.
  // Only the drag handle starts a reorder; selecting, copying and editing still work normally.
  const listNode=$('rvList');let pointerDrag=null;
  function clearDrag(){
    listNode.querySelectorAll('.rv-card').forEach(c=>c.classList.remove('rv-drag-source','rv-drop-before','rv-drop-after'));
    listNode.classList.remove('rv-sort-active');pointerDrag=null;
  }
  async function moveReview(id,targetId,before,focus=false){
    if(busy||!key||!id||!targetId||id===targetId)return;
    const old=items.slice();const list=visibleItems().filter(x=>x.id!==id);
    const source=items.find(x=>x.id===id);if(!source)return;
    const targetIndex=list.findIndex(x=>x.id===targetId);if(targetIndex<0)return;
    list.splice(targetIndex+(before?0:1),0,source);
    if(list.every((x,i)=>x.id===visibleItems()[i]?.id))return;
    const stamp=new Date().toISOString();const ordered=list.map((x,i)=>({...x,order:i,orderUpdatedAt:stamp}));
    busy=true;items=[...ordered,...items.filter(x=>x.deletedAt)];
    try{
      await saveVault();render();message('계정 순서를 암호화 저장했습니다.');
      if(focus){const btn=Array.from(listNode.querySelectorAll('.rv-drag-handle')).find(x=>x.closest('.rv-card')?.dataset.rvId===id);btn?.focus();}
    }catch(e){items=old;render();fail(e);}finally{busy=false;}
  }
  listNode.addEventListener('pointerdown',e=>{
    const handle=e.target.closest('.rv-drag-handle');if(!handle||busy)return;
    if($('rvSearch').value.trim()){message('순서를 바꾸려면 검색어를 먼저 지워 주세요.',true);return;}
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const card=handle.closest('.rv-card');if(!card)return;
    e.preventDefault();
    pointerDrag={pointerId:e.pointerId,handle,id:card.dataset.rvId,startX:e.clientX,startY:e.clientY,targetId:null,before:true,active:false};
    try{handle.setPointerCapture(e.pointerId);}catch{}
  });
  listNode.addEventListener('pointermove',e=>{
    const drag=pointerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
    if(!drag.active){if(Math.hypot(e.clientX-drag.startX,e.clientY-drag.startY)<7)return;drag.active=true;listNode.classList.add('rv-sort-active');}
    const cards=Array.from(listNode.querySelectorAll('.rv-card')).filter(c=>c.dataset.rvId!==drag.id);
    if(!cards.length)return;
    const sourceCard=Array.from(listNode.querySelectorAll('.rv-card')).find(c=>c.dataset.rvId===drag.id);
    sourceCard?.classList.add('rv-drag-source');
    let target=cards.find(card=>e.clientY<card.getBoundingClientRect().bottom);
    if(!target)target=cards[cards.length-1];
    const bounds=target.getBoundingClientRect();const before=e.clientY<bounds.top+bounds.height/2;
    listNode.querySelectorAll('.rv-card').forEach(c=>c.classList.remove('rv-drop-before','rv-drop-after'));
    target.classList.add(before?'rv-drop-before':'rv-drop-after');
    drag.targetId=target.dataset.rvId;drag.before=before;
    if(e.cancelable)e.preventDefault();
  });
  listNode.addEventListener('pointerup',e=>{
    const drag=pointerDrag;if(!drag||drag.pointerId!==e.pointerId)return;
    const {id,targetId,before,active}=drag;clearDrag();
    if(active&&targetId)moveReview(id,targetId,before).catch(fail);
  });
  listNode.addEventListener('pointercancel',clearDrag);
  listNode.addEventListener('lostpointercapture',()=>{if(pointerDrag)clearDrag();});
  listNode.addEventListener('keydown',e=>{
    const handle=e.target.closest('.rv-drag-handle');if(!handle||!['ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();if($('rvSearch').value.trim()){message('순서를 바꾸려면 검색어를 먼저 지워 주세요.',true);return;}
    const id=handle.closest('.rv-card')?.dataset.rvId;const index=items.findIndex(x=>x.id===id);
    const delta=e.key==='ArrowUp'?-1:1;const neighbor=items[index+delta];
    if(neighbor)moveReview(id,neighbor.id,delta<0,true).catch(fail);
  });


  // Shared review accounts: a separate AES-GCM encrypted Drive file. Never store
  // plaintext credentials in Drive, category settings, URLs, or localStorage.
  const REVIEW_CLOUD_FILE='ClientDesk_review_accounts_encrypted_v1.json';
  const REVIEW_CLOUD_APP='clientdesk-review-accounts';
  const REVIEW_CLOUD_API='https://www.googleapis.com/drive/v3/files';
  const REVIEW_CLOUD_UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
  let cloudBusy=false,cloudPending=false,cloudTimer=0,cloudLast=0,changeCounter=0,syncOnVaultReady=false;
  const encoder=new TextEncoder(),b64of=arr=>b64(arr),fromB64=str=>from64(str);
  const timeMs=value=>{const t=Date.parse(value||'');return Number.isFinite(t)?t:0;};
  function visibleItems(){return items.filter(x=>!x.deletedAt);}
  function safeRecords(records){
    if(!Array.isArray(records)||records.length>5000)throw Error('리뷰 계정 데이터 형식이 올바르지 않습니다.');
    return records.filter(x=>x&&typeof x.id==='string'&&x.id.length<150).map((x,i)=>({
      id:x.id,owner:String(x.owner||'').slice(0,90),login:String(x.login||'').slice(0,160),
      password:String(x.password||'').slice(0,300),phone:String(x.phone||'').slice(0,40),
      updatedAt:x.updatedAt||'2000-01-01T00:00:00.000Z',
      order:Number.isFinite(x.order)?x.order:i,orderUpdatedAt:x.orderUpdatedAt||'2000-01-01T00:00:00.000Z',
      deletedAt:x.deletedAt||null
    }));
  }
  function mergedRecords(a,b){
    const map=new Map();
    for(const record of [...safeRecords(a),...safeRecords(b)]){
      const prev=map.get(record.id);
      if(!prev){map.set(record.id,record);continue;}
      const winner=timeMs(record.updatedAt)>timeMs(prev.updatedAt)?record:prev;
      const newerOrder=timeMs(record.orderUpdatedAt)>timeMs(prev.orderUpdatedAt)?record:prev;
      map.set(record.id,{...winner,order:newerOrder.order,orderUpdatedAt:newerOrder.orderUpdatedAt});
    }
    return Array.from(map.values()).sort((x,y)=>x.order-y.order||x.id.localeCompare(y.id));
  }
  function cloudMessage(t,error=false){message(t,error);const info=$('rvCloudInfo');if(info)info.textContent=t;updateReviewGoogleUI();}
  function queueCloud(delay=700){clearTimeout(cloudTimer);cloudTimer=setTimeout(()=>syncReviewCloud(false).catch(e=>cloudMessage('이 기기에 보관됨 · '+e.message,true)),delay);}
  async function googleToken(){
    let tok=window.ClientDeskCategorySync?.getAccessToken?.()||'';
    if(!tok&&!isMobile&&typeof chrome!=='undefined'&&chrome.identity?.getAuthToken){
      const resp=await chrome.identity.getAuthToken({interactive:false,scopes:['https://www.googleapis.com/auth/drive.file']});
      tok=typeof resp==='string'?resp:resp?.token||'';
    }
    if(!tok)throw Error('Google 계정을 먼저 연결한 뒤 동기화해 주세요.');
    return tok;
  }
  async function cloudRequest(tok,url,options={}){
    const response=await fetch(url,{...options,cache:'no-store',headers:{Authorization:'Bearer '+tok,...(options.headers||{})}});
    if(!response.ok)throw Error('Google Drive 요청 실패 ('+response.status+')');
    return response;
  }
  async function findCloudFile(tok,name){
    const q=new URLSearchParams({q:`name = '${name}' and trashed = false`,spaces:'drive',fields:'nextPageToken,files(id,name,version,modifiedTime)',pageSize:'100'});
    const data=await (await cloudRequest(tok,REVIEW_CLOUD_API+'?'+q)).json();
    if(data.nextPageToken)throw Error('Drive 파일 검색 결과가 많아 안전하게 확인할 수 없습니다.');
    if((data.files||[]).length>1)throw Error('Drive에 같은 이름의 파일이 여러 개 있습니다. 중복 파일을 확인해 주세요.');
    return data.files?.[0]||null;
  }
  async function getExistingKey(tok,interactive){
    if(!isMobile){
      const raw=localStorage.getItem('cd4_device_key'),salt=localStorage.getItem('cd4_device_salt');
      if(!raw||!salt)throw Error('PC의 Google Drive 거래처 동기화 PIN을 먼저 연결해 주세요.');
      return {key:await crypto.subtle.importKey('raw',fromB64(raw),{name:'AES-GCM'},false,['encrypt','decrypt']),salt};
    }
    // Reuse the key already remembered by the mobile CRM (if opted in).
    let rec=null;
    try{
      rec=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('wwtt-mobile-clientdesk-v1',1);
        request.onsuccess=()=>{
          const database=request.result;
          if(!database.objectStoreNames.contains('data')){database.close();resolve(null);return;}
          const tx=database.transaction('data','readonly');const get=tx.objectStore('data').get('main');
          get.onsuccess=()=>{database.close();resolve(get.result||null);};
          get.onerror=()=>{database.close();reject(get.error);};
        };
        request.onerror=()=>reject(request.error);
      });
    }catch(e){console.warn('리뷰 계정 PIN 확인:',e);}
    if(rec?.key&&rec?.keySalt)return {key:rec.key,salt:rec.keySalt};
    const saved=await rw('readonly',store=>store.get('cloudKey'));
    if(saved?.key&&saved?.salt)return saved;
    if(!interactive)throw Error('리뷰 계정의 첫 동기화에는 기존 거래처 PIN 연결이 필요합니다.');
    const crm=await findCloudFile(tok,'ClientDesk_거래처_자동동기화.json');
    if(!crm)throw Error('Drive에서 기존 거래처 암호화 백업을 찾지 못했습니다. 거래처 동기화를 먼저 연결해 주세요.');
    const envelope=await(await cloudRequest(tok,REVIEW_CLOUD_API+'/'+encodeURIComponent(crm.id)+'?alt=media')).json();
    if(!envelope?.keySalt||!envelope.iv||!envelope.ciphertext)throw Error('기존 거래처 암호화 파일을 확인할 수 없습니다.');
    const pin=prompt('리뷰 계정 동기화 연결: PC 거래처 관리와 같은 4자리 PIN을 입력해 주세요.');
    if(pin===null)throw Error('PIN 입력을 취소했습니다. 기존 계정은 그대로 보관됩니다.');
    if(!/^\d{4}$/.test(pin))throw Error('숫자 4자리 PIN을 입력해 주세요.');
    const shared=await window.WWTT_CRYPTO.keyFromPin(pin,envelope.keySalt);
    try{await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(envelope.iv)},shared,fromB64(envelope.ciphertext));}
    catch{throw Error('PIN이 다르거나 기존 거래처 암호화 데이터가 손상되었습니다.');}
    const entry={key:shared,salt:envelope.keySalt};
    await rw('readwrite',store=>store.put(entry,'cloudKey'));
    return entry;
  }
  async function encryptCloud(records,shared){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},shared.key,encoder.encode(JSON.stringify({records,version:1}))));
    return {app:REVIEW_CLOUD_APP,version:1,revision:crypto.randomUUID(),updatedAt:Date.now(),keySalt:shared.salt,iv:b64of(iv),ciphertext:b64of(cipher)};
  }
  async function decryptCloud(data,shared){
    if(data?.app!==REVIEW_CLOUD_APP||data.version!==1||data.keySalt!==shared.salt||!data.iv||!data.ciphertext)
      throw Error('기존 리뷰 계정 파일의 암호화 키가 다르거나 형식이 맞지 않습니다.');
    let plain;
    try{plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(data.iv)},shared.key,fromB64(data.ciphertext));}
    catch{throw Error('리뷰 계정의 암호를 풀 수 없습니다. 다른 Google 계정 또는 PIN을 확인해 주세요.');}
    const decoded=JSON.parse(new TextDecoder().decode(plain));
    return safeRecords(decoded.records);
  }
  async function writeCloud(tok,existing,data){
    const body=JSON.stringify(data);
    if(existing){
      await cloudRequest(tok,REVIEW_CLOUD_UPLOAD+'/'+encodeURIComponent(existing.id)+'?uploadType=media',
        {method:'PATCH',headers:{'Content-Type':'application/json'},body});
    }else{
      const boundary='review-'+crypto.randomUUID();
      const multipart='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify({name:REVIEW_CLOUD_FILE,mimeType:'application/json'})+
        '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+body+'\r\n--'+boundary+'--';
      await cloudRequest(tok,REVIEW_CLOUD_UPLOAD+'?uploadType=multipart',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart});
    }
  }
  async function syncReviewCloud(interactive=false){
    if(!key||!db){if(interactive){syncOnVaultReady=true;cloudMessage('암호화 보관함 준비 후 자동으로 동기화합니다.');}return;}
    if(modal.open){cloudMessage('계정 수정 중 · 저장을 마친 뒤 동기화합니다.');return;}
    if(cloudBusy){cloudPending=true;return;}
    cloudBusy=true;cloudMessage('리뷰 계정 암호화 동기화 중…');
    try{
      const token=await googleToken();const shared=await getExistingKey(token,interactive);
      let file=await findCloudFile(token,REVIEW_CLOUD_FILE);
      let remote=[];
      if(file){
        const payload=await (await cloudRequest(token,REVIEW_CLOUD_API+'/'+encodeURIComponent(file.id)+'?alt=media')).json();
        remote=await decryptCloud(payload,shared);
      }
      // Read both sides and merge by record ID, timestamp and independent order timestamp.
      // Never replace local records with remote records blindly.
      const startSeq=changeCounter;
      const merged=mergedRecords(items,remote);
      const localText=JSON.stringify(items),cloudText=JSON.stringify(remote);
      if(JSON.stringify(merged)!==localText){
        items=merged;await saveVault(false);render();
      }
      if(JSON.stringify(merged)!==cloudText){
        // Re-read cloud just before upload to reduce multi-device overwrite races.
        if(file){
          const current=await (await cloudRequest(token,REVIEW_CLOUD_API+'/'+encodeURIComponent(file.id)+'?alt=media')).json();
          const newlyRemote=await decryptCloud(current,shared);
          const safer=mergedRecords(items,newlyRemote);
          if(JSON.stringify(safer)!==JSON.stringify(items)){items=safer;await saveVault(false);render();}
        }
        await writeCloud(token,file,await encryptCloud(items,shared));
      }
      cloudLast=Date.now();
      if(startSeq!==changeCounter){cloudPending=true;}
      cloudMessage('PC·모바일 리뷰 계정 동기화 완료 · '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));
    }catch(e){cloudMessage('로컬 계정 유지 · '+e.message,true);if(interactive)console.warn('Review sync failed',e);}
    finally{cloudBusy=false;if(cloudPending){cloudPending=false;queueCloud(1300);}}
  }
  // The original CRM OAuth button is the single source of truth for Google
  // authentication. Never create a second OAuth client or store access tokens.
  // Reuse the user's existing Google Calendar / Drive connection flow.
  let syncAfterGoogleConnect=false;
  let connectAttemptTimer=0;
  const hasReviewToken=()=>!!window.ClientDeskCategorySync?.getAccessToken?.();
  function updateReviewGoogleUI(){
    if(!isMobile)return;
    const linked=hasReviewToken();
    const state=$('rvGoogleState');
    if(state){state.textContent=linked?'● Google 계정 연결됨':'○ Google 계정 연결 필요';state.classList.toggle('connected',linked);}
    const button=$('rvGoogleConnect');
    if(button)button.textContent=linked?'Google 다시 연결':'Google 계정 연결';
  }
  function connectGoogleAndSync(){
    const original=$('connectGoogle');
    if(!original){cloudMessage('설정 화면의 Google 연결 기능을 찾지 못했습니다.',true);return;}
    if(syncAfterGoogleConnect){cloudMessage('Google 계정 승인 창을 먼저 확인해 주세요.');return;}
    syncAfterGoogleConnect=true;
    clearTimeout(connectAttemptTimer);
    connectAttemptTimer=setTimeout(()=>{if(syncAfterGoogleConnect){syncAfterGoogleConnect=false;cloudMessage('Google 연결을 완료하지 못했습니다. 다시 시도해 주세요.',true);}},120000);
    cloudMessage('Google 로그인 창에서 연결을 승인해 주세요. 완료 후 리뷰 계정을 자동 동기화합니다.');
    // Executed synchronously on a real click, preserving the browser popup gesture.
    original.click();
  }
  function runReviewSync(){
    if(!hasReviewToken()){
      connectGoogleAndSync();
      return;
    }
    syncReviewCloud(true).catch(e=>cloudMessage(e.message,true));
  }
  $('rvGoogleConnect').addEventListener('click',connectGoogleAndSync);
  $('rvCloudSync').addEventListener('click',runReviewSync);
  window.addEventListener('clientdesk-google-token-observed',()=>{
    updateReviewGoogleUI();
    if(!syncAfterGoogleConnect)return;
    syncAfterGoogleConnect=false;
    clearTimeout(connectAttemptTimer);
    syncReviewCloud(true).catch(e=>cloudMessage(e.message,true));
  });
  updateReviewGoogleUI();
  window.addEventListener('focus',updateReviewGoogleUI);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateReviewGoogleUI();});
  modal.addEventListener('close',()=>queueCloud(400));
  window.addEventListener('focus',()=>{if(Date.now()-cloudLast>45000)queueCloud(600);});
  window.addEventListener('online',()=>queueCloud(600));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&Date.now()-cloudLast>45000)queueCloud(600);});
  setInterval(()=>{if(!document.hidden&&!cloudBusy&&Date.now()-cloudLast>60000&&navigator.onLine)queueCloud(800);},45000);

  $('rvAdd').addEventListener('click',()=>edit());$('rvSearch').addEventListener('input',render);
  $('rvClose').addEventListener('click',()=>modal.close());$('rvCancel').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
  $('rvReveal').addEventListener('click',()=>{const field=$('rvPassword'),button=$('rvReveal');field.type=field.type==='password'?'text':'password';const exposed=field.type==='text';button.innerHTML=exposed?RV_EYE_OFF_SVG:RV_EYE_SVG;button.setAttribute('aria-label',exposed?'비밀번호 숨기기':'비밀번호 보기');button.title=button.getAttribute('aria-label');button.setAttribute('aria-pressed',String(exposed));});
  modal.addEventListener('click',event=>{const b=event.target.closest('[data-fieldcopy]');if(b){const field=$(b.dataset.fieldcopy);copy(field?.value||'',field?.id==='rvPassword'?'PW':field?.id==='rvPhone'?'휴대폰번호':'ID');}});
  $('rvForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;$('rvSave').disabled=true;
    const entry={id:activeId||unique(),owner:$('rvOwner').value.trim(),login:$('rvLogin').value.trim(),password:$('rvPassword').value,phone:$('rvPhone').value.trim(),updatedAt:new Date().toISOString()};
    if(!entry.owner||!entry.login||!entry.password){message('명의자, ID, PW를 입력해 주세요.',true);busy=false;$('rvSave').disabled=false;return;}
    const before=items.slice();try{const index=items.findIndex(x=>x.id===entry.id);if(index<0){entry.order=-1;entry.orderUpdatedAt=entry.updatedAt;items.unshift(entry);items=visibleItems().map((x,i)=>({...x,order:i,orderUpdatedAt:entry.updatedAt})).concat(items.filter(x=>x.deletedAt));}else{entry.order=items[index].order;entry.orderUpdatedAt=items[index].orderUpdatedAt;items[index]=entry;}await saveVault();modal.close();render();message(activeId?'계정 수정 완료':'계정 저장 완료');}
    catch(err){items=before;fail(err);}finally{busy=false;$('rvSave').disabled=false;}
  });
  $('rvDelete').addEventListener('click',async()=>{if(!activeId||busy)return;const item=items.find(x=>x.id===activeId);if(!item||!confirm(`${item.owner}의 리뷰 계정 정보를 삭제하시겠습니까?`))return;busy=true;const before=items.slice();try{items=items.map(x=>x.id===activeId?{...x,owner:'',login:'',password:'',phone:'',deletedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}:x);await saveVault();modal.close();render();message('계정을 삭제했습니다.');}catch(err){items=before;fail(err);}finally{busy=false;}});
  initVault().catch(fail);
})();
