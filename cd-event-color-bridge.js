/* Client Desk v1.2.15 / PC v0.6.29 – reliable event color bridge.
   A type's 28-color default applies to the event editor, Google Calendar metadata,
   and native Client Desk calendar rendering. No client/Drive records are touched. */
(()=>{
 'use strict';
 if(window.__clientDeskEventColorBridge15)return;
 window.__clientDeskEventColorBridge15=true;
 const typesKey='wwtt_clientdesk_calendar_types_v2';
 const P=window.ClientDeskPalette;
 if(!P){console.warn('ClientDesk palette not ready');return;}
 const scheme=id=>P.get(id)||P.get('lavender');
 const eventStore=new Map();
 let paintQueued=false;
 const googlePalette={
  white:'8',lilac:'3',lavender:'3',iceblue:'7',navy:'9',mint:'2',teal:'10',
  sage:'2',green:'10',apricot:'6',pink:'4',red:'11',peach:'6',yellow:'5',
  cream:'5',rose:'4',burgundy:'11',slate:'8',charcoal:'8',cocoa:'6',powder:'7',
  pastelblue:'1',blue:'9',cyan:'7',midnight:'9',gray:'8',graphite:'8',black:'8'
 };
 function types(){try{const v=JSON.parse(localStorage.getItem(typesKey));return Array.isArray(v)?v:[];}catch{return [];}}
 function category(id){return types().find(c=>c.id===id);}
 function elementType(root){
   if(!root)return null;
   const direct=root.querySelector('select[name="type"],select[name="eventType"],select[name="scheduleType"],select[name="category"],select[id="eventType"],select[id="scheduleType"]');
   if(direct)return direct;
   return [...root.querySelectorAll('select')].find(x=>[...x.options].some(o=>/업무\s*일정|개인\s*일정|할\s*일/.test(o.textContent)));
 }
 function elementColor(root){return root?.querySelector('select[name="color"],select[name="eventColor"],select[name="scheduleColor"],select[id="eventColor"],input[name="color"]')||null;}
 function findEditor(){
   const roots=[...document.querySelectorAll('dialog[open],.dialog[open],.event-modal.open,.modal.show,[role="dialog"][aria-hidden="false"]')].filter(n=>!n.id?.includes('TypeManager')&&!n.id?.includes('TypesManager'));
   const editor=roots.find(r=>elementType(r))||roots.find(r=>r.querySelector('form[id*="event" i],input[name="summary"]'));
   return editor||null;
 }
 function syncTypeDefault(root){
   const t=elementType(root),color=elementColor(root);
   const c=category(t?.value);
   if(!t||!c)return;
   const p=scheme(c.color);
   if(color){
     if(color.tagName==='SELECT'&&![...color.options].some(o=>o.value===p.id))color.add(new Option(p.label,p.id));
     if(color.value!==p.id){color.value=p.id;color.dispatchEvent(new Event('change',{bubbles:true}));}
   }
   root.dataset.cdTypeDefault=p.id;
   root.style.setProperty('--cd-type-default-bg',p.bg);
   root.style.setProperty('--cd-type-default-fg',p.fg);
 }
 // Preserve explicit custom choice after type selection. Type change ALWAYS selects its default.
 document.addEventListener('change',e=>{
   const t=e.target;
   if(t?.matches?.('select[name="type"],select[name="eventType"],select[name="scheduleType"],select[name="category"],select[id="eventType"],select[id="scheduleType"]')){
     const root=t.closest('dialog,[role="dialog"],.event-modal,.modal')||t.closest('form');
     if(root&&root.id!=='cdTypeManager'&&root.id!=='cdPcTypesManager')queueMicrotask(()=>syncTypeDefault(root));
   }
 },false);
 const isCalendarUrl=url=>/https:\/\/(?:www\.)?googleapis\.com\/calendar\/v3\/calendars\/[^/?]+\/events(?:[/?#]|$)/i.test(url);
 const rawFetch=window.fetch.bind(window);
 window.fetch=async function(resource,options){
   let url='';try{url=typeof resource==='string'?resource:resource?.url||'';}catch{}
   if(!isCalendarUrl(url))return rawFetch(resource,options);
   const method=String(options?.method||'GET').toUpperCase();
   let next=options;
   if(['POST','PATCH','PUT'].includes(method)&&typeof options?.body==='string'){
     try{
       const json=JSON.parse(options.body);
       if(json&&typeof json.summary==='string'&&json.start&&json.end){
         const root=findEditor();
         const t=elementType(root),color=elementColor(root);
         const original=json.extendedProperties?.private||{};
         const chosenType=t?.value||original.clientDeskType||'';
         const c=category(chosenType);
         // The editor's chosen colour wins; when missing, apply the type default.
         const chosen= P.get(color?.value)||P.get(original.clientDeskColor)||P.get(c?.color)||P.get('lavender');
         json.extendedProperties ||= {};
         json.extendedProperties.private ||= {};
         const priv=json.extendedProperties.private;
         if(c){priv.clientDeskType=c.id;priv.clientDeskTypeName=c.name;priv.clientDeskTypeDefaultColor=c.color;}
         if(chosen){
           priv.clientDeskColor=chosen.id;
           priv.clientDeskColorBg=chosen.bg;
           priv.clientDeskColorText=chosen.fg;
           json.colorId=googlePalette[chosen.id]||'3';
         }
         next={...options,body:JSON.stringify(json)};
       }
     }catch(err){console.warn('ClientDesk color metadata preparation failed',err);}
   }
   const response=await rawFetch(resource,next);
   if(response?.ok){response.clone().json().then(readEvents).catch(()=>{});}
   return response;
 };
 function readEvents(payload){
   const events=Array.isArray(payload?.items)?payload.items:payload?.id?[payload]:[];
   let updated=false;
   for(const event of events){
     if(!event?.id)continue;
     const prior=eventStore.get(event.id)||{};
     const merged={...prior,...event,extendedProperties:{...prior.extendedProperties,...event.extendedProperties,
       private:{...prior.extendedProperties?.private,...event.extendedProperties?.private}}};
     eventStore.set(event.id,merged);updated=true;
   }
   if(updated)queuePaint();
 }
 function eventScheme(e){
   const v=e?.extendedProperties?.private||{};
   return P.get(v.clientDeskColor)||P.get(v.clientDeskTypeDefaultColor)||P.get(category(v.clientDeskType)?.color)||null;
 }
 function decorateTarget(el,p){
   if(!el||!p)return;
   if(el.dataset.cdCurrentColor===p.id)return;
   el.style.setProperty('--cd-event-color',p.bg);
   el.style.setProperty('--cd-event-text',p.fg);
   el.style.setProperty('--cd-event-bg',p.bg);
   el.style.setProperty('--cd-event-fg',p.fg);
   el.style.setProperty('background-color',p.bg,'important');
   el.style.setProperty('color',p.fg,'important');
   el.dataset.cdCurrentColor=p.id;
   el.dataset.cd28Colored='1';
 }
 function matchesSummary(el,summary){
   if(!summary)return false;
   const a=(el.getAttribute('title')||el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim();
   return !!a&&(a===summary||a.includes(summary));
 }
 function paintScope(parent){
   if(!parent)return;
   const events=[...eventStore.values()].filter(e=>e?.summary&&eventScheme(e));
   if(!events.length)return;
   const candidates=[...parent.querySelectorAll('[data-event-id],.event-card,.event-chip,.calendar-event,.calendar-chip,.event-pill,.cal-event,.day-event,.event-item,[class*="event-badge"],[class*="event-tag"]')];
   for(const node of candidates){
     let e=node.dataset.eventId?eventStore.get(node.dataset.eventId):null;
     if(!e){const matches=events.filter(x=>matchesSummary(node,x.summary));if(matches.length===1)e=matches[0];}
     if(e)decorateTarget(node,eventScheme(e));
   }
 }
 function paint(){paintQueued=false;paintScope(document.getElementById('dayEvents'));paintScope(document.getElementById('monthGrid'));
   // Also style PC schedule chips, if they expose an event id or summary.
   for(const section of document.querySelectorAll('#calendarView,#calendarPanel,.calendar-view,.calendar-container,[data-view="calendar"]')){
     paintScope(section);
   }
 }
 function queuePaint(){if(paintQueued)return;paintQueued=true;requestAnimationFrame(paint);}
 const calendarRoots=['#dayEvents','#monthGrid','#calendarView','#calendarPanel','.calendar-view','.calendar-container'];
 const watched=new WeakSet();
 function watch(){for(const sel of calendarRoots){for(const root of document.querySelectorAll(sel)){
   if(watched.has(root))continue;watched.add(root);
   new MutationObserver(queuePaint).observe(root,{childList:true,subtree:true,characterData:true});
 }}queuePaint();}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
 // Install on late-rendered PC/SPA elements, without polling or network requests.
 new MutationObserver(()=>{for(const s of calendarRoots){for(const node of document.querySelectorAll(s))if(!watched.has(node)){watch();return;}}}).observe(document.documentElement,{childList:true});
 window.ClientDeskEventColorBridge=Object.freeze({version:'1.2.15',eventStore,readEvents,category,eventScheme,syncTypeDefault,paint});
})();
