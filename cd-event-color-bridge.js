/* Client Desk 1.2.16: same per-event colours on PC and mobile.
   The colour is saved in Google Calendar extendedProperties.private; app-specific
   28-colour display never depends on Google's reduced 11-colour palette. */
(()=>{
 'use strict';
 if(window.__clientDeskEventColorBridge16)return;
 window.__clientDeskEventColorBridge16=true;
 const Palette=window.ClientDeskPalette;
 if(!Palette)return;
 const TYPE_KEY='wwtt_clientdesk_calendar_types_v2';
 const byId=new Map();
 let queued=false;
 const GOOGLE_TO_PALETTE={1:'pastelblue',2:'green',3:'lavender',4:'rose',5:'yellow',6:'apricot',7:'iceblue',8:'gray',9:'navy',10:'teal',11:'red'};
 function categories(){try{const rows=JSON.parse(localStorage.getItem(TYPE_KEY)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
 function category(typeId){return categories().find(c=>c.id===typeId)||null;}
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
       }
     }catch(e){console.warn('ClientDesk colour serialization',e);}
   }
   const response=await sourceFetch(resource,req);
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
 function paintPc(){
   const roots=document.querySelectorAll('#calendarPanel,#calendarView,.calendar-view,.calendar-container,[data-view="calendar"]');
   // Some PC calendar views expose an event ID; others show only an event title.
   // Title fallback is limited to UNIQUE titles so same-named events cannot be mismatched.
   const byTitle=new Map();
   for(const ev of byId.values()){
     const title=String(ev.summary||'').trim();if(!title)continue;
     if(byTitle.has(title))byTitle.set(title,null);else byTitle.set(title,ev);
   }
   for(const root of roots){
     for(const el of root.querySelectorAll('[data-event-id]')){
       const ev=byId.get(el.dataset.eventId);
       if(!ev)continue;
       const tgt=el.closest('.event-card,.event-chip,.agenda-item,.calendar-event,.day-event,.cal-event')||el;
       assign(tgt,schemeFor(ev));
     }
     for(const el of root.querySelectorAll('.event-chip,.agenda-item,.calendar-event,.day-event,.cal-event,.event-pill,.calendar-chip')){
       if(el.dataset.cd28Colored==='1'||el.querySelector('[data-event-id]'))continue;
       const label=(el.getAttribute('title')||el.textContent||'').trim();
       const ev=byTitle.get(label);
       if(ev)assign(el,schemeFor(ev));
     }
   }
 }
 function paint(){queued=false;paintMobile();paintPc();}
 function queuePaint(){if(queued)return;queued=true;requestAnimationFrame(paint);}
 const watched=new WeakSet();
 function watch(){
   for(const s of ['#monthGrid','#dayEvents','#calendarPanel','#calendarView','.calendar-view','.calendar-container']){
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
 window.ClientDeskEventColorBridge=Object.freeze({version:'1.2.19',readEvents,queuePaint,paint,schemeFor,eventsOn,byId});
})();
