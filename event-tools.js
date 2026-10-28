/* Client Desk Mobile 1.2.9 — calendar form enhancements. No changes to Drive / Calendar requests. */
(()=>{
  'use strict';
  const dialog=document.getElementById('eventDialog');
  const form=document.getElementById('eventForm');
  if(!dialog||!form)return;
  const field=name=>form.elements.namedItem(name);
  const pad=n=>String(n).padStart(2,'0');
  let quickClient=null;
  let lastAutoBlock='';
  let generation=0;
  
  // Capture data before the existing quick-event handler switches views.
  document.getElementById('clientList')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-client-event]');
    if(!button)return;
    const card=button.closest('.client-card');
    quickClient={
      id:button.dataset.clientEvent||'',
      ceo:card?.querySelector('.card-info > .info')?.textContent?.trim()||'',
      phone:card?.querySelector('.contact-group > .info')?.textContent?.trim()||''
    };
  },true);

  // The PC app records representative + phone in description for a client appointment.
  // Read the local snapshot only when the record is not currently on a visible card.
  function readClient(id){
    return new Promise(resolve=>{
      if(!id||!('indexedDB' in window))return resolve(null);
      let settled=false;
      const finish=v=>{if(!settled){settled=true;resolve(v);}};
      try{
        const req=indexedDB.open('wwtt-mobile-clientdesk-v1');
        req.onerror=()=>finish(null);
        req.onupgradeneeded=()=>{try{req.transaction.abort();}catch{}finish(null);};
        req.onsuccess=()=>{
          const db=req.result;
          if(!db.objectStoreNames.contains('data')){db.close();return finish(null);}
          const item=db.transaction('data','readonly').objectStore('data').get('main');
          item.onsuccess=()=>{
            const rows=item.result?.snapshot?.rows||[];
            db.close();finish(rows.find(r=>r.id===id)?.values||null);
          };
          item.onerror=()=>{db.close();finish(null);};
        };
      }catch{finish(null);}
    });
  }
  function cleanContact(v){
    const s=String(v||'').trim();
    return /^(대표자 미등록|연락처 미등록|없음|undefined|null)$/.test(s)?'':s;
  }
  function writeAutoContact(client){
    const memo=field('description');
    if(!memo)return;
    const previous=lastAutoBlock;
    let base=memo.value||'';
    if(previous&&base.includes(previous))base=base.replace(previous,'').trim();
    const name=cleanContact(client?.ceo);
    const phone=cleanContact(client?.phone);
    const lines=[];
    if(name)lines.push('대표자: '+name);
    if(phone)lines.push('휴대폰: '+phone);
    lastAutoBlock=lines.join('\n');
    if(lastAutoBlock&&!base.includes(lastAutoBlock))memo.value=[base,lastAutoBlock].filter(Boolean).join(base?'\n\n':'');
    else memo.value=base;
    memo.dispatchEvent(new Event('input',{bubbles:true}));
  }
  async function syncContact(){
    const current=++generation;
    const selected=field('client')?.value||'';
    const title=document.getElementById('eventModalTitle')?.textContent||'';
    // Preserve descriptions on edit and copy, never overwrite existing event notes.
    if(!dialog.open||title!=='새 일정')return;
    if(!selected){writeAutoContact(null);return;}
    let values=null;
    if(quickClient?.id===selected){
      values={ceo:quickClient.ceo,phone:quickClient.phone};
    }else{
      const stored=await readClient(selected);
      if(stored)values={ceo:stored.ceo,phone:stored.phone};
    }
    if(current!==generation||!dialog.open||field('client')?.value!==selected)return;
    writeAutoContact(values);
  }
  new MutationObserver(()=>{
    if(!dialog.open)return;
    lastAutoBlock='';
    // Core openEventForClient sets the client ID after calling showModal;
    // observing the open attribute runs after that synchronous handler finishes.
    syncContact();
    refreshMapLinks();
  }).observe(dialog,{attributes:true,attributeFilter:['open']});
  field('client')?.addEventListener('change',()=>syncContact());
  dialog.addEventListener('close',()=>{generation++;lastAutoBlock='';quickClient=null;});

  function makeModal(id,title){
    const d=document.createElement('dialog');
    d.id=id;d.className='cd-tool-modal';
    const head=document.createElement('div');head.className='cd-tool-head';
    const h=document.createElement('strong');h.textContent=title;
    const close=document.createElement('button');close.type='button';close.className='cd-tool-close';close.textContent='×';close.setAttribute('aria-label','닫기');
    close.addEventListener('click',()=>d.close());
    head.append(h,close);d.append(head);document.body.append(d);
    return d;
  }

  // Two independently scrollable columns, 00–23 hours and 00–59 minutes.
  const timeDialog=makeModal('cdTimeDialog','시간 선택 · 24시간제');
  const cols=document.createElement('div');cols.className='cd-time-cols';
  const colHour=document.createElement('div');colHour.className='cd-time-col';
  const colMin=document.createElement('div');colMin.className='cd-time-col';
  const colWrap=(label,col)=>{const w=document.createElement('section');const l=document.createElement('span');l.className='cd-time-label';l.textContent=label;w.append(l,col);return w;};
  cols.append(colWrap('시',colHour),colWrap('분',colMin));
  timeDialog.append(cols);
  const foot=document.createElement('div');foot.className='cd-time-foot';
  const selectedText=document.createElement('strong');selectedText.className='cd-time-selected';
  const apply=document.createElement('button');apply.type='button';apply.className='cd-tool-primary';apply.textContent='적용';
  foot.append(selectedText,apply);timeDialog.append(foot);
  let targetInput=null,hour=9,minute=0;
  const renderTime=()=>{
    selectedText.textContent=`${pad(hour)}:${pad(minute)}`;
    for(const b of colHour.children)b.classList.toggle('chosen',Number(b.dataset.val)===hour);
    for(const b of colMin.children)b.classList.toggle('chosen',Number(b.dataset.val)===minute);
  };
  function makeNumButtons(root,numbers,kind){
    for(let n=0;n<numbers;n++){
      const b=document.createElement('button');b.type='button';b.dataset.val=String(n);b.textContent=pad(n);
      b.setAttribute('aria-label',(kind==='hour'?'시 ':'분 ')+pad(n));
      b.addEventListener('click',()=>{if(kind==='hour')hour=n;else minute=n;renderTime();});
      root.append(b);
    }
  }
  makeNumButtons(colHour,24,'hour');makeNumButtons(colMin,60,'minute');
  function openTime(input){
    if(input.disabled)return;
    targetInput=input;
    const match=/^(\d{2}):(\d{2})$/.exec(input.value||'');
    hour=match?Math.min(23,Number(match[1])):9;
    minute=match?Math.min(59,Number(match[2])):0;
    renderTime();timeDialog.showModal();
    // Center selected items after layout without altering the main form scroll.
    requestAnimationFrame(()=>{
      colHour.querySelector('.chosen')?.scrollIntoView({block:'center',inline:'nearest'});
      colMin.querySelector('.chosen')?.scrollIntoView({block:'center',inline:'nearest'});
    });
  }
  apply.addEventListener('click',()=>{
    if(targetInput){targetInput.value=`${pad(hour)}:${pad(minute)}`;targetInput.dispatchEvent(new Event('input',{bubbles:true}));targetInput.dispatchEvent(new Event('change',{bubbles:true}));}
    timeDialog.close();
  });
  for(const name of ['start','end']){
    const input=field(name);if(!input)continue;
    // Avoid mobile OS native time wheel. The existing form still receives HH:mm.
    input.type='text';input.readOnly=true;input.inputMode='none';
    input.pattern='(?:[01][0-9]|2[0-3]):[0-5][0-9]';
    input.placeholder='00:00';input.classList.add('cd-time-input');
    input.setAttribute('role','button');input.setAttribute('aria-haspopup','dialog');
    input.setAttribute('aria-label',`${name==='start'?'시작':'종료'} 시간 선택`);
    input.addEventListener('click',()=>openTime(input));
    input.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openTime(input);}});
  }

  // Road-name address search via Daum postcode, with direct map search links.
  const location=field('location');
  const locLabel=location?.closest('label');
  let naverLink,kakaoLink,googleLink;
  function mapUrl(q,provider){
    const v=encodeURIComponent(q||'대한민국');
    if(provider==='naver')return `https://map.naver.com/p/search/${v}`;
    if(provider==='kakao')return `https://map.kakao.com/?q=${v}`;
    return `https://www.google.com/maps/search/?api=1&query=${v}`;
  }
  function refreshMapLinks(){
    if(!location)return;
    const q=location.value.trim();
    if(naverLink)naverLink.href=mapUrl(q,'naver');
    if(kakaoLink)kakaoLink.href=mapUrl(q,'kakao');
    if(googleLink)googleLink.href=mapUrl(q,'google');
  }
  if(locLabel){
    const actions=document.createElement('div');actions.className='cd-address-actions';
    const searchBtn=document.createElement('button');searchBtn.type='button';searchBtn.className='cd-address-search';searchBtn.textContent='⌕ 주소 검색';
    const link=(text,provider)=>{
      const a=document.createElement('a');a.className='cd-map-link';a.target='_blank';a.rel='noopener noreferrer';a.textContent=text+' ↗';a.href=mapUrl('',provider);return a;
    };
    naverLink=link('네이버 지도','naver');kakaoLink=link('카카오맵','kakao');googleLink=link('Google 지도','google');
    actions.append(searchBtn,naverLink,kakaoLink,googleLink);
    locLabel.append(actions);location.addEventListener('input',refreshMapLinks);
    const addrDialog=makeModal('cdAddressDialog','도로명·지번 주소 검색');
    addrDialog.classList.add('cd-address-dialog');
    const hint=document.createElement('p');hint.className='cd-address-hint';hint.textContent='검색 결과를 선택하면 장소 칸에 자동 입력됩니다. 상세 장소명은 선택 후 추가해 주세요.';
    const addressWrap=document.createElement('div');addressWrap.className='cd-address-embed';
    addrDialog.append(hint,addressWrap);
    const loaded=()=>new Promise((resolve,reject)=>{
      if(window.daum?.Postcode)return resolve();
      const existing=document.querySelector('script[data-cd-postcode]');
      if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(Error('주소 검색을 불러오지 못했습니다.')),{once:true});return;}
      const script=document.createElement('script');script.dataset.cdPostcode='1';
      script.src='https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
      script.onload=()=>window.daum?.Postcode?resolve():reject(Error('주소 검색 모듈을 확인할 수 없습니다.'));
      script.onerror=()=>{script.remove();reject(Error('주소 검색 연결에 실패했습니다.'));};
      document.head.append(script);
    });
    searchBtn.addEventListener('click',async()=>{
      addressWrap.replaceChildren();
      const loading=document.createElement('p');loading.className='cd-address-loading';loading.textContent='주소 검색을 불러오는 중…';addressWrap.append(loading);
      addrDialog.showModal();
      try{
        await loaded();if(!addrDialog.open)return;
        addressWrap.replaceChildren();
        const postcode=new window.daum.Postcode({
          width:'100%',height:'100%',
          oncomplete:data=>{
            const address=(data.roadAddress||data.jibunAddress||data.address||'').trim();
            if(address){location.value=address;location.dispatchEvent(new Event('input',{bubbles:true}));location.dispatchEvent(new Event('change',{bubbles:true}));}
            addrDialog.close();
          }
        });
        postcode.embed(addressWrap,{q:location.value.trim()||undefined,autoClose:false});
      }catch(e){
        addressWrap.replaceChildren();
        const msg=document.createElement('p');msg.className='cd-address-loading';msg.textContent=e.message+' 직접 주소를 입력하거나 지도 링크를 이용해 주세요.';
        const fallback=link('네이버 지도에서 검색','naver');fallback.href=mapUrl(location.value,'naver');
        addressWrap.append(msg,fallback);
      }
    });
  }
})();
