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
  const btn=document.createElement('button');btn.type='button';btn.id='rvNav';
  if(isMobile){btn.className='tab rv-tab';btn.innerHTML=`<span aria-hidden="true">${LOCK_ICON}</span><small>리뷰계정</small>`;btn.dataset.view='reviewAccounts';nav.insertBefore(btn,$('tabTrash'));}
  else{btn.className='side-nav';btn.innerHTML=`<span class="nav-icon" aria-hidden="true">${LOCK_ICON}</span><span>리뷰 계정 관리</span>`;const cl=$('navClients');cl.parentNode.insertBefore(btn,cl.nextSibling);}
  const page=document.createElement(isMobile?'section':'main');page.id=isMobile?'reviewView':'reviewPage';page.hidden=true;
  page.className=isMobile?'view rv-page':'main-content rv-page';
  page.innerHTML=`<div class="rv-top"><div><p class="eyebrow">REVIEW ACCOUNT MANAGEMENT</p><h1>리뷰 계정 관리</h1><p class="rv-muted">명의자별 로그인 정보와 인증용 연락처를 관리합니다. 손잡이를 드래그해 순서를 바꿀 수 있습니다.</p></div><button type="button" class="rv-primary" id="rvAdd">+ 계정 추가</button></div>
    <div class="rv-tools"><input id="rvSearch" type="search" placeholder="명의자·ID·휴대폰번호 검색" aria-label="리뷰 계정 검색" autocomplete="off"><span id="rvCount">0건</span></div>
    <div class="rv-list" id="rvList"></div><p class="rv-privacy">🔒 비밀번호는 암호화하여 이 기기에 저장합니다. 이 메뉴의 계정은 아직 Google Drive로 자동 동기화되지 않습니다.</p><p class="rv-status" id="rvStatus" role="status" aria-live="polite"></p>`;
  if(isMobile)mount.insertBefore(page,$('settingsView'));else mount.appendChild(page);
  const modal=document.createElement('dialog');modal.id='rvDialog';modal.className='rv-dialog';
  modal.innerHTML=`<form id="rvForm" autocomplete="off"><div class="rv-modal-heading"><h2 id="rvDialogTitle">리뷰 계정 추가</h2><button type="button" class="rv-close" id="rvClose" aria-label="닫기">×</button></div>
    <div class="rv-body"><label>명의자 <span aria-hidden="true">*</span><input id="rvOwner" maxlength="90" required autocomplete="off" placeholder="명의자 이름"></label>
    <label>ID <span aria-hidden="true">*</span><div class="rv-field-action"><input id="rvLogin" maxlength="160" required autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="리뷰 관리용 아이디"><button type="button" class="rv-icon-btn" data-fieldcopy="rvLogin" aria-label="ID 복사" title="ID 복사">⧉</button></div></label>
    <label>PW <span aria-hidden="true">*</span><div class="rv-field-action"><input id="rvPassword" type="password" maxlength="300" required autocomplete="new-password" spellcheck="false" placeholder="비밀번호"><button type="button" class="rv-icon-btn" id="rvReveal" aria-label="비밀번호 보기" title="비밀번호 보기">◉</button><button type="button" class="rv-icon-btn" data-fieldcopy="rvPassword" aria-label="PW 복사" title="PW 복사">⧉</button></div></label>
    <label>인증용 휴대폰번호<div class="rv-field-action"><input id="rvPhone" type="tel" inputmode="tel" maxlength="40" autocomplete="off" placeholder="010-0000-0000"><button type="button" class="rv-icon-btn" data-fieldcopy="rvPhone" aria-label="휴대폰번호 복사" title="휴대폰번호 복사">⧉</button></div></label></div>
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
      const parsed=JSON.parse(new TextDecoder().decode(buffer));if(!Array.isArray(parsed))throw Error('리뷰 계정 데이터에 오류가 있습니다.');items=parsed;
    }
    render();message('암호화 보관함 준비 완료');
  }
  async function saveVault(){
    if(!db||!key)throw Error('암호화 저장소를 준비하지 못했습니다.');
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode(JSON.stringify(items)));
    await rw('readwrite',store=>store.put({version:1,iv:b64(iv),cipher:b64(new Uint8Array(encrypted))},'records'));
  }
  function el(tag,cls,txt){const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x;}
  function action(label,title,fn,kind=''){const b=el('button','rv-action '+kind,label);b.type='button';b.title=title;b.addEventListener('click',fn);return b;}
  async function copy(value,label){if(!value){message('복사할 값이 없습니다.',true);return;}try{await navigator.clipboard.writeText(value);message(label+' 복사 완료');}catch{message('클립보드 접근을 허용해 주세요.',true);}}
  function render(){const root=$('rvList');if(!root)return;root.replaceChildren();const q=$('rvSearch').value.trim().toLowerCase();const filtered=items.filter(o=>[o.owner,o.login,o.phone].some(s=>String(s||'').toLowerCase().includes(q)));$('rvCount').textContent=`${filtered.length}건`;
    if(!filtered.length){root.append(el('div','rv-empty',q?'검색 결과가 없습니다.':'저장된 리뷰 계정이 없습니다. + 계정 추가를 눌러주세요.'));return;}
    for(const item of filtered){const card=el('article','rv-card');card.dataset.rvId=item.id;const title=el('div','rv-card-top');const dragHandle=el('button','rv-drag-handle');dragHandle.type='button';dragHandle.innerHTML=GRIP_ICON;dragHandle.title='드래그하여 순서 변경 · 키보드 위아래 화살표 지원';dragHandle.setAttribute('aria-label',item.owner+' 순서 이동');title.append(dragHandle,el('strong','rv-owner',item.owner),action('수정','계정 수정',()=>edit(item.id)));
      const row=el('div','rv-row');row.append(el('small','rv-label','ID'),el('span','rv-value',item.login),action('⧉','ID 복사',()=>copy(item.login,'ID'),'rv-icon-action'));card.append(title,row);
      const pw=el('div','rv-row');pw.append(el('small','rv-label','PW'),el('span','rv-value','••••••••'),action('⧉','PW 복사',()=>copy(item.password,'PW'),'rv-icon-action'));card.append(pw);
      const ph=el('div','rv-row');const masked=item.phone?item.phone.replace(/\d(?=\d{4})/g,'•'):'미등록';ph.append(el('small','rv-label','인증번호'),el('span','rv-value',masked),action('⧉','휴대폰번호 복사',()=>copy(item.phone,'휴대폰번호'),'rv-icon-action'));card.append(ph);root.append(card);
    }
  }
  function edit(id=null){if(!key){message('암호화 저장소를 준비 중입니다.',true);return;}activeId=id;const item=items.find(x=>x.id===id)||{};$('rvDialogTitle').textContent=id?'리뷰 계정 수정':'리뷰 계정 추가';$('rvOwner').value=item.owner||'';$('rvLogin').value=item.login||'';$('rvPassword').value=item.password||'';$('rvPhone').value=item.phone||'';$('rvPassword').type='password';$('rvDelete').hidden=!id;modal.showModal();}
  function openPage(){
    if(isMobile){for(const section of document.querySelectorAll('.app-shell > main > .view'))section.hidden=section!==page;document.querySelectorAll('.bottom-nav .tab').forEach(tab=>tab.classList.toggle('active',tab===btn));document.body.classList.remove('cd-calendar-visible');}
    else {for(const node of mount.children)if(node.classList?.contains('main-content'))node.hidden=node!==page;document.querySelectorAll('.side-nav').forEach(b=>b.classList.toggle('active',b===btn));}
    page.hidden=false;render();
  }
  btn.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openPage();},true);
  if(isMobile)nav.addEventListener('click',event=>{if(!event.target.closest('#rvNav')&&event.target.closest('.tab'))page.hidden=true;},true);
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
    const old=items.slice();const list=items.filter(x=>x.id!==id);
    const source=items.find(x=>x.id===id);if(!source)return;
    const targetIndex=list.findIndex(x=>x.id===targetId);if(targetIndex<0)return;
    list.splice(targetIndex+(before?0:1),0,source);
    if(list.every((x,i)=>x.id===items[i]?.id))return;
    busy=true;items=list;
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

  $('rvAdd').addEventListener('click',()=>edit());$('rvSearch').addEventListener('input',render);
  $('rvClose').addEventListener('click',()=>modal.close());$('rvCancel').addEventListener('click',()=>modal.close());
  modal.addEventListener('click',e=>{if(e.target===modal)modal.close();});
  $('rvReveal').addEventListener('click',()=>{const field=$('rvPassword');field.type=field.type==='password'?'text':'password';$('rvReveal').setAttribute('aria-label',field.type==='password'?'비밀번호 보기':'비밀번호 숨기기');});
  modal.addEventListener('click',event=>{const b=event.target.closest('[data-fieldcopy]');if(b){const field=$(b.dataset.fieldcopy);copy(field?.value||'',field?.id==='rvPassword'?'PW':field?.id==='rvPhone'?'휴대폰번호':'ID');}});
  $('rvForm').addEventListener('submit',async e=>{e.preventDefault();if(busy)return;busy=true;$('rvSave').disabled=true;
    const entry={id:activeId||unique(),owner:$('rvOwner').value.trim(),login:$('rvLogin').value.trim(),password:$('rvPassword').value,phone:$('rvPhone').value.trim(),updatedAt:new Date().toISOString()};
    if(!entry.owner||!entry.login||!entry.password){message('명의자, ID, PW를 입력해 주세요.',true);busy=false;$('rvSave').disabled=false;return;}
    const before=items.slice();try{const index=items.findIndex(x=>x.id===entry.id);if(index<0)items.unshift(entry);else items[index]=entry;await saveVault();modal.close();render();message(activeId?'계정 수정 완료':'계정 저장 완료');}
    catch(err){items=before;fail(err);}finally{busy=false;$('rvSave').disabled=false;}
  });
  $('rvDelete').addEventListener('click',async()=>{if(!activeId||busy)return;const item=items.find(x=>x.id===activeId);if(!item||!confirm(`${item.owner}의 리뷰 계정 정보를 삭제하시겠습니까?`))return;busy=true;const before=items.slice();try{items=items.filter(x=>x.id!==activeId);await saveVault();modal.close();render();message('계정을 삭제했습니다.');}catch(err){items=before;fail(err);}finally{busy=false;}});
  initVault().catch(fail);
})();
