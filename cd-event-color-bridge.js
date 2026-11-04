/* Client Desk 1.2.20: same per-event colours on PC and mobile.
   The colour is saved in Google Calendar extendedProperties.private; app-specific
   28-colour display never depends on Google's reduced 11-colour palette. */
(()=>{
 'use strict';
 if(window.__clientDeskEventColorBridge20)return;
 window.__clientDeskEventColorBridge20=true;
 const Palette=window.ClientDeskPalette;
 if(!Palette)return;
 const TYPE_KEY='wwtt_clientdesk_calendar_types_v2';
 const byId=new Map();
 // If a native PC editor writes through an alternate transport, remember the
 // last successfully closed edit so the visible month card can be updated.
 const FALLBACK_KEY='wwtt_cd_event_palette_overrides_v1220';
 const fallbackByKey=new Map();
 function stripTitle(t){return String(t||'').replace(/\s+/g,' ').trim();}
 function stripTime(t){return stripTitle(t).replace(/\s*(?:[·•|,]?\s*)\b(?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[~–-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?\s*$/,'').trim();}
 const key=(day,title)=>String(day||'')+'|'+stripTitle(title);
 function restoreOverrides(){try{
   const records=JSON.parse(localStorage.getItem(FALLBACK_KEY)||'[]');
   for(const x of Array.isArray(records)?records:[]){
     if(x&&typeof x.key==='string'&&Palette.get(x.color)&&Date.now()-x.at<180*86400000)fallbackByKey.set(x.key,x);
   }
 }catch{}}
 function rememberFallback(day,title,color,source='manual'){
   const c=Palette.get(color);if(!day||!stripTitle(title)||!c)return;
   fallbackByKey.set(key(day,title),{key:key(day,title),color:c.id,source,at:Date.now()});
   try{const records=[...fallbackByKey.values()].sort((a,b)=>b.at-a.at).slice(0,400);
      localStorage.setItem(FALLBACK_KEY,JSON.stringify(records));}catch{}
   queuePaint();
 }
 restoreOverrides();
 let queued=false;
 const GOOGLE_TO_PALETTE={1:'pastelblue',2:'green',3:'lavender',4:'rose',5:'yellow',6:'apricot',7:'iceblue',8:'gray',9:'navy',10:'teal',11:'red'};
 function categories(){try{const rows=JSON.parse(localStorage.getItem(TYPE_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
 function category(typeId){return categories().find(c=>c.id===typeId)||null;}
 function fallbackColor(day,title){return Palette.get(fallbackByKey.get(key(day,title))?.color);}
 function schemeFor(ev){
   if(!ev)return null;
   const p=ev.extendedProperties?.private||{};
   const selected=Palette.get(p.clientDeskColor);
   const inherited=Palette.get(p.clientDeskTypeDefaultColor)||Palette.get(category(p.clientDeskType)?.color);
   // v1.2.15 accidentally saved white for new events in some editor paths.
   if(selected?.id==='white'&&p.clientDeskColorSource!=='manual'&&inherited?.id!=='white')return inherited;
   return selected||inherited||(p.clientDeskColorBg&&p.clientDeskColorText?{id:'saved',bg:p.clientDeskColorBg,fg:p.clientDeskColorText}:null)||(ev.colorId?Palette.get(GOOGLE_TO_PALETTE[ev.colorId]):null);
 }
 function readEvents(payload){
   const records=Array.isArray(payload?.items)?payload.items:payload?.id?[payload]:[];
   let changed=false;
   for(const ev of records){
     if(!ev?.id||ev.status==='cancelled')continue;
     const prev=byId.get(ev.id)||{};
     byId.set(ev.id,{...prev,...ev,extendedProperties:{...prev.extendedProperties,...ev.extendedProperties,
       private:{...prev.extendedProperties?.private,...ev.extendedProperties?.private}}});
     // A server response with explicit colour is authoritative on this device.
     const priv=byId.get(ev.id)?.extendedProperties?.private||{};
     const date=ev.start?.date||ev.start?.dateTime?.slice(0,10);
     if(priv.clientDeskColor&&date&&ev.summary){
       const ov=fallbackByKey.get(key(date,ev.summary));
       if(ov&&ov.color===priv.clientDeskColor)fallbackByKey.delete(key(date,ev.summary));
     }
     changed=true;
   }
   if(changed)queuePaint();
 }
 const isCal=url=>/^https:\/\/(?:www\.)?googleapis\.com\/calendar\/v3\/calendars\/[^/?]+\/events(?:[/?#]|$)/.test(url);
 const googleColor={white:'8',lilac:'3',lavender:'3',iceblue:'7',navy:'9',mint:'2',teal:'10',sage:'2',green:'10',apricot:'6',pink:'4',red:'11',peach:'6',yellow:'5',cream:'5',rose:'4',burgundy:'11',slate:'8',charcoal:'8',cocoa:'6',powder:'7',pastelblue:'1',blue:'9',cyan:'7',midnight:'9',gray:'8',graphite:'8',black:'8'};
 function editorType(root){return root?.querySelector('select[name="type"],select[name="eventType"],select[name="category"],select[name="scheduleType"]')||null;}
 function editorColor(root){return root?.querySelector('select[name="color"],select[name="eventColor"],select[name="scheduleColor"]')||null;}
 function openEditor(){return [...document.querySelectorAll('dialog[open],.event-modal.open,[role="dialog"][aria-hidden="false"]')].find(n=>n.id!=='cdTypeManager'&&n.id!=='cdPcTypesManager'&&editorType(n))||null;}
 const sourceFetch=window.fetch.bind(window);
 window.fetch=async (resource,init)=>{
   let url='';try{url=typeof resource==='string'?resource:resource?.url||'';}catch{}
   if(!isCal(url))return sourceFetch(resource,init);
   const method=String(init?.method||'GET').toUpperCase();
   let req=init;
   let sentEvent=null;
   if(['POST','PUT','PATCH'].includes(method)&&typeof init?.body==='string'){
     try{
       const data=JSON.parse(init.body);
       // Never touch patches for event completion, trash or reminder settings only.
       if(typeof data?.summary==='string'&&data?.start&&data?.end){
         const root=openEditor();
         const priv={...data.extendedProperties?.private};
         const typeId=editorType(root)?.value||priv.clientDeskType;
         const manual=root?.dataset.cdColorSource==='manual'||root?.querySelector('form')?.dataset.cdColorSource==='manual';
         const selected=manual?(root?.dataset.cdColorId||editorColor(root)?.value):(editorColor(root)?.value||root?.dataset.cdColorId);
         const cat=category(typeId);
         // The selected 28-colour entry takes priority, not Google's colorId.
         // Recover legacy auto-white when a non-white category was selected.
         let color=Palette.get(selected)||Palette.get(priv.clientDeskColor)||Palette.get(cat?.color);
         if(color?.id==='white'&&cat?.color!=='white'&&!manual&&priv.clientDeskColorSource!=='manual')color=Palette.get(cat.color)||color;
         if(cat){priv.clientDeskType=cat.id;priv.clientDeskTypeName=cat.name;priv.clientDeskTypeDefaultColor=cat.color;}
         if(color){priv.clientDeskColorSource=manual?'manual':'type';priv.clientDeskColor=color.id;priv.clientDeskColorBg=color.bg;priv.clientDeskColorText=color.fg;data.colorId=googleColor[color.id]||'3';}
         data.extendedProperties={...data.extendedProperties,private:priv};
         req={...init,body:JSON.stringify(data)};
         sentEvent=data;
       }
     }catch(e){console.warn('ClientDesk colour serialization',e);}
   }
   const response=await sourceFetch(resource,req);
   if(response?.ok&&sentEvent?.summary){
     const d=sentEvent.start?.date||sentEvent.start?.dateTime?.slice(0,10);
     const c=sentEvent.extendedProperties?.private?.clientDeskColor;
     if(d&&c)rememberFallback(d,sentEvent.summary,c,sentEvent.extendedProperties?.private?.clientDeskColorSource);
   }
   if(response?.ok&&['GET','POST','PATCH','PUT'].includes(method)){
     response.clone().json().then(readEvents).catch(()=>{});
   }
   return response;
 };
 function activeDay(ev,day){
   const start=ev.start?.date||ev.start?.dateTime?.slice(0,10);
   if(!start||day<start)return false;
   const end=ev.end?.date||ev.end?.dateTime?.slice(0,10)||start;
   if(ev.start?.date)return day<end;
   // A timed event ending exactly midnight doesn't occupy the next day.
   if(day===end&&/^T00:00/.test(ev.end?.dateTime?.slice(10)||''))return false;
   return day<=end;
 }
 function sortEvents(a,b){
   const ad=a.extendedProperties?.private?.clientDeskDone==='1',bd=b.extendedProperties?.private?.clientDeskDone==='1';
   if(ad!==bd)return ad?1:-1;
   const at=Date.parse(a.start?.dateTime||((a.start?.date||'')+'T00:00:00')),
         bt=Date.parse(b.start?.dateTime||((b.start?.date||'')+'T00:00:00'));
   return (at||0)-(bt||0)||String(a.summary||'').localeCompare(String(b.summary||''),'ko');
 }
 function eventsOn(date){return [...byId.values()].filter(ev=>ev.status!=='cancelled'&&ev.extendedProperties?.private?.clientDeskInTrash!=='1'&&activeDay(ev,date)).sort(sortEvents);}
 function assign(node,c){
   if(!node||!c)return;
   if(node.dataset.cd28Color===c.id&&node.style.getPropertyValue('--cd-event-bg')===c.bg)return;
   node.dataset.cd28Colored='1';node.dataset.cd28Color=c.id;
   node.style.setProperty('--cd-event-bg',c.bg);
   node.style.setProperty('--cd-event-fg',c.fg);
   node.style.setProperty('--cd-event-color',c.bg);
   node.style.setProperty('--cd-event-text',c.fg);
 }
 function paintMobile(){
   const list=document.getElementById('dayEvents');
   if(list){
     for(const card of list.querySelectorAll('.event-card')){
       const id=card.querySelector('[data-event-id]')?.dataset.eventId;
       assign(card,schemeFor(byId.get(id)));
     }
   }
   const grid=document.getElementById('monthGrid');
   if(grid){
     for(const cell of grid.querySelectorAll('.day-cell[data-day]')){
       const events=eventsOn(cell.dataset.day);
       [...cell.querySelectorAll('.agenda-list .agenda-item')].forEach((n,i)=>assign(n,schemeFor(events[i])));
       [...cell.querySelectorAll('.calendar-dots b')].forEach((n,i)=>{
         const p=schemeFor(events[i]);if(p)n.style.setProperty('background-color',p.bg,'important');
       });
     }
   }
 }
 // Find real events rather than matching a chip's entire text, which also
 // contains time (e.g. "테스트 09:00"). Colour is always read from the event
 // itself or the last saved override, NEVER inferred from the type alone when
 // a custom colour was selected.
 const PC_EVENT_SELECTOR=[
   '.event-chip','.agenda-item','.calendar-event','.day-event','.cal-event',
   '.event-pill','.calendar-chip','.calendar-item','.calendar-event-item',
   '.schedule-event','.schedule-chip','.cal-item','.event-bar',
   '[data-event-id]'
 ].join(',');
 const PC_CALENDAR_ROOT_SELECTOR=[
   '#calendarPanel','#calendarView','#calendarGrid','#calendar',
   '.calendar-view','.calendar-container','.calendar-grid','.calendar-body',
   '.month-grid','.month-view','[data-view="calendar"]'
 ].join(',');
 function dayFromCell(el){
   const parent=el.closest('[data-day],[data-date],[data-ymd],[data-calendar-date]');
   for(const a of ['data-day','data-date','data-ymd','data-calendar-date']){
     const raw=parent?.getAttribute(a)||'';
     const found=raw.match(/\d{4}-\d{2}-\d{2}/);
     if(found)return found[0];
   }
   return '';
 }
 function labelFromChip(el){
   const preferred=el.querySelector('.event-title,.event-name,.cal-title,.schedule-title,[data-event-title]');
   return stripTitle(preferred?.getAttribute('data-event-title')||preferred?.textContent||el.getAttribute('data-event-title')||el.getAttribute('title')||el.textContent);
 }
 function collectCandidates(){
   const byTitle=new Map();
   for(const ev of byId.values()){
     const title=stripTitle(ev.summary);if(!title)continue;
     if(!byTitle.has(title))byTitle.set(title,[]);
     byTitle.get(title).push(ev);
   }
   return byTitle;
 }
 function findMatchingEvent(id,title,day,byTitle){
   if(id&&byId.has(id))return byId.get(id);
   let possible=byTitle.get(title)||byTitle.get(stripTime(title))||[];
   if(day)possible=possible.filter(ev=>activeDay(ev,day));
   return possible.length===1?possible[0]:null;
 }
 function paintPc(){
   const byTitle=collectCandidates();
   const roots=[...document.querySelectorAll(PC_CALENDAR_ROOT_SELECTOR)].filter(el=>
      !el.closest('dialog,[role="dialog"],.event-modal'));
   if(!roots.length)return;
   const seen=new Set();
   for(const root of roots){
     for(const el of root.querySelectorAll(PC_EVENT_SELECTOR)){
       if(seen.has(el)||el.closest('dialog,[role="dialog"],.event-modal'))continue;
       seen.add(el);
       if(el.tagName==='BUTTON'&&/^(수정|복사|삭제|완료)$/.test(stripTitle(el.textContent)))continue;
       const label=labelFromChip(el),title=stripTime(label),day=dayFromCell(el);
       const id=el.dataset.eventId||el.querySelector('[data-event-id]')?.dataset.eventId||'';
       const ev=findMatchingEvent(id,label,day,byTitle)||findMatchingEvent(id,title,day,byTitle);
       const d=day||(ev?.start?.date||ev?.start?.dateTime?.slice(0,10)||'');
       const local=fallbackByKey.get(key(d,title));
       const localColor=Palette.get(local?.color);
       const serverColor=ev?schemeFor(ev):null;
       const updated=Date.parse(ev?.updated||'')||0;
       // A just-saved manual selection is newer than the calendar snapshot.
       // Once Google returns a newer event, server metadata takes priority.
       const preferLocal=!!localColor&&(!serverColor||!updated||local.at>=updated);
       let c=(preferLocal?localColor:serverColor)||localColor||serverColor;
       if(!c&&!day){
         const matches=[...fallbackByKey.values()].filter(x=>x.key.endsWith('|'+title));
         if(matches.length===1)c=Palette.get(matches[0].color);
       }
       if(!c)continue;
       const target=el.closest('[data-event-id].event-card,[data-event-id].event-chip')||el;
       assign(target,c);
       target.classList.add('cd28-painted-pc');
       target.style.setProperty('background-color',c.bg,'important');
       target.style.setProperty('color',c.fg,'important');
       target.style.setProperty('border-left-color',c.fg,'important');
       // Native calendar CSS may set the title colour on an inner element.
       const text=target.querySelector('.event-title,.event-name,.cal-title,.schedule-title');
       if(text)text.style.setProperty('color',c.fg,'important');
     }
   }
 }
 function pcEditorInfo(root){
   if(!root||root.id==='cdPcTypesManager'||root.classList.contains('cd28-palette-dialog'))return null;
   const title=root.querySelector('input[name="summary"],input[name="title"],input[name="eventTitle"],#eventTitle');
   const date=root.querySelector('input[name="date"],input[name="startDate"],input[name="eventStartDate"],input[type="date"]');
   const type=editorType(root);
   if(!title?.value?.trim()||!date?.value||!type)return null;
   const manual=root.dataset.cdColorSource==='manual';
   const color=manual?root.dataset.cdColorId:
      (root.dataset.cdColorId||category(type.value)?.color);
   return Palette.get(color)?{title:title.value.trim(),day:date.value,color}:null;
 }
 function visibleEditor(root){
   if(!root.isConnected)return false;
   if(root.tagName==='DIALOG')return root.open;
   if(root.hidden||root.getAttribute('aria-hidden')==='true')return false;
   return !!root.getClientRects().length&&getComputedStyle(root).visibility!=='hidden'&&getComputedStyle(root).display!=='none';
 }
 // Fallback only: native PC editors may save through gapi/extension transport,
 // bypassing fetch. Wait for the editor to close before registering an override;
 // a click on Save alone is not evidence of successful persistence.
 function onPcSave(e){
   const btn=e.target.closest('button,input[type="submit"]');if(!btn)return;
   const label=(btn.textContent||btn.value||'').trim();
   if(!/(저장|등록|수정|save)/i.test(label)||/(기본색|종류)/.test(label))return;
   const root=btn.closest('dialog,.event-modal,.modal,[role="dialog"]');
   if(!root)return;
   const draft=pcEditorInfo(root);if(!draft)return;
   let tries=0;
   const check=()=>{
     if(!visibleEditor(root)){
       rememberFallback(draft.day,draft.title,draft.color);
       [100,350,900].forEach(ms=>setTimeout(queuePaint,ms));
     }else if(++tries<26){setTimeout(check,200);}
   };
   setTimeout(check,100);
 }
 document.addEventListener('click',onPcSave,true);
 document.addEventListener('submit',e=>{
   const root=e.target.closest('dialog,.event-modal,.modal,[role="dialog"]');
   if(root){
     const btn=e.submitter;if(btn)onPcSave({target:btn});
   }
 },true);
 function paint(){queued=false;paintMobile();paintPc();}
 function queuePaint(){if(queued)return;queued=true;requestAnimationFrame(paint);}
 const watched=new WeakSet();
 function watch(){
   for(const s of ['#monthGrid','#dayEvents','#calendarPanel','#calendarView','#calendarGrid','#calendar','.calendar-view','.calendar-container','.calendar-grid','.month-grid']){
     for(const node of document.querySelectorAll(s)){
       if(watched.has(node))continue;
       watched.add(node);
       new MutationObserver(queuePaint).observe(node,{childList:true,subtree:true});
     }
   }
   queuePaint();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
 new MutationObserver(()=>watch()).observe(document.documentElement,{childList:true});
 // Use the same cached Google Calendar snapshot as the native PWA for offline display.
 function readCached(){try{
   const req=indexedDB.open('wwtt-mobile-clientdesk-v1');
   req.onupgradeneeded=()=>req.transaction?.abort();
   req.onsuccess=()=>{const db=req.result;if(!db.objectStoreNames.contains('data')){db.close();return;}
     const get=db.transaction('data','readonly').objectStore('data').get('calendar-snapshot-v1');
     get.onsuccess=()=>{readEvents(get.result);db.close();};get.onerror=()=>db.close();};
 }catch{}}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',readCached,{once:true});else readCached();
 window.ClientDeskEventColorBridge=Object.freeze({version:'1.2.20',readEvents,queuePaint,paint,schemeFor,eventsOn,byId});
})();
