/* Client Desk Mobile v1.2.11 — Google Calendar popup reminders. */
(()=>{
 'use strict';
 const dialog=document.getElementById('eventDialog');
 const form=document.getElementById('eventForm');
 if(!dialog||!form)return;
 const preset=[['10분 전',10],['30분 전',30],['1시간 전',60],['하루 전',1440],['3일 전',4320],['7일 전',10080],['14일 전',20160]];
 const box=document.createElement('section');box.className='cd-reminders';
 box.innerHTML='<div class="cd-reminders-title">휴대폰 사전 알림</div><p class="cd-reminders-help">최대 5개 선택 · Google 캘린더 앱 알림 권한 필요</p>';
 const grid=document.createElement('div');grid.className='cd-reminders-grid';
 for(const [label,minutes] of preset){
   const wrap=document.createElement('label');wrap.className='cd-reminders-choice';
   const check=document.createElement('input');check.type='checkbox';check.value=String(minutes);check.dataset.calendarReminder='1';
   const span=document.createElement('span');span.textContent=label;wrap.append(check,span);grid.append(wrap);
 }
 box.append(grid);
 const message=document.createElement('p');message.className='cd-reminders-info';message.setAttribute('aria-live','polite');box.append(message);
 // The notice belongs to the scrollable form content, after the color field.
 // Keep only the header and save/delete action bar outside the scroller.
 const scroller=form.querySelector(':scope > .form-grid');
 const actions=form.querySelector('.dialog-actions');
 if(scroller)scroller.append(box);
 else if(actions)actions.before(box);
 else form.append(box);
 const checks=[...grid.querySelectorAll('input')];
 let modified=false,epoch=0;
 const events=new Map();
 const toast=msg=>{message.textContent=msg;};
 const readValues=()=>checks.filter(c=>c.checked).map(c=>Number(c.value));
 const fill=values=>{
   const selected=new Set(values);
   for(const c of checks)c.checked=selected.has(Number(c.value));
   toast('');
 };
 grid.addEventListener('change',e=>{
   if(!e.target.matches('input'))return;
   modified=true;
   if(readValues().length>5){e.target.checked=false;toast('알림은 최대 5개까지 선택할 수 있습니다.');}
   else toast('');
 });
 const sourceFetch=window.fetch.bind(window);
 const CALENDAR_EVENTS=/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/[^/?]+\/events(?:[/?#]|$)/;
 window.fetch=async function cdRemindersFetch(resource,options){
   let url='';try{url=typeof resource==='string'?resource:resource instanceof URL?resource.href:resource?.url||'';}catch{}
   if(!CALENDAR_EVENTS.test(url))return sourceFetch(resource,options);
   const method=String(options?.method||((typeof Request!=='undefined'&&resource instanceof Request)?resource.method:'GET')).toUpperCase();
   let updated=options;
   if(['POST','PATCH','PUT'].includes(method)&&typeof options?.body==='string'&&dialog.open){
     try{
       const data=JSON.parse(options.body);
       if(data&&typeof data.summary==='string'&&data.start&&data.end){
         // On an untouched existing event, preserve its previous Google reminders.
         if(method==='POST'||modified){
           const picked=readValues();
           if(picked.length>5)throw Error('사전 알림은 최대 5개입니다.');
           data.reminders={useDefault:false,overrides:picked.map(minutes=>({method:'popup',minutes}))};
           updated={...options,body:JSON.stringify(data)};
         }
       }
     }catch(e){console.warn('사전 알림 설정 오류',e);}
   }
   const response=await sourceFetch(resource,updated);
   if(response.ok&&method==='GET'){
     response.clone().json().then(data=>{
       if(Array.isArray(data?.items)){for(const ev of data.items)if(ev?.id)events.set(ev.id,ev);}
       else if(data?.id)events.set(data.id,data);
     }).catch(()=>{});
   }
   return response;
 };
 let clickId='';
 document.addEventListener('click',e=>{
   const button=e.target?.closest?.('[data-event-id]');
   if(button)clickId=button.dataset.eventId||'';
 },true);
 function fromDatabase(id){
   return new Promise(resolve=>{
     if(!id||!('indexedDB' in window))return resolve(null);
     try{
       const open=indexedDB.open('wwtt-mobile-clientdesk-v1');
       open.onupgradeneeded=()=>{try{open.transaction.abort();}catch{}resolve(null);};
       open.onerror=()=>resolve(null);
       open.onsuccess=()=>{
         const db=open.result;
         if(!db.objectStoreNames.contains('data')){db.close();return resolve(null);}
         const request=db.transaction('data','readonly').objectStore('data').get('calendar-snapshot-v1');
         request.onsuccess=()=>{db.close();resolve((request.result?.items||[]).find(x=>x.id===id)||null);};
         request.onerror=()=>{db.close();resolve(null);};
       };
     }catch{resolve(null);}
   });
 }
 async function syncOpen(){
   const id=++epoch;
   if(scroller)scroller.scrollTop=0;
   const title=document.getElementById('eventModalTitle')?.textContent||'';
   modified=false;
   if(!title.includes('수정')){fill([60]);clickId='';return;}
   // Recover the same Calendar event's existing notification settings.
   fill([]);
   const chosen=clickId;
   const ev=events.get(chosen)||await fromDatabase(chosen);
   if(id!==epoch||!dialog.open||modified)return;
   if(ev?.reminders){
      if(ev.reminders.useDefault)toast('기존 Google 캘린더 기본 알림 유지 중 · 체크 변경 시 새로운 알림 적용');
      else fill((ev.reminders.overrides||[]).map(x=>x.minutes));
   }else if(!ev)toast('기존 알림은 유지됩니다. 체크를 변경하면 선택한 알림으로 저장됩니다.');
   clickId='';
 }
 new MutationObserver(()=>{if(dialog.open)syncOpen();}).observe(dialog,{attributes:true,attributeFilter:['open']});
 dialog.addEventListener('close',()=>{epoch++;modified=false;clickId='';});
})();
