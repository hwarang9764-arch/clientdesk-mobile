/* Client Desk shared 28-color palette: identical IDs and RGB values on PC and mobile. */
(()=>{
 'use strict';
 if(window.ClientDeskPalette?.version==='28.1')return;
 const colors=[
  ['white','기본','#FFFFFF','#303746'],['lilac','연보라','#EEE5FC','#6339A6'],['lavender','보라','#725CCC','#FFFFFF'],['iceblue','하늘','#D9F0FE','#245C7C'],['navy','남색','#17324B','#FFFFFF'],['mint','민트','#DCF7EE','#246B5B'],['teal','청록','#147D75','#FFFFFF'],
  ['sage','연두','#E2EDD7','#49652F'],['green','초록','#1C7952','#FFFFFF'],['apricot','살구','#FFE3D5','#A95430'],['pink','분홍','#FCE2EB','#B43763'],['red','빨강','#BA2429','#FFFFFF'],['peach','연살구','#FFE7D9','#A35432'],['yellow','노랑','#FFF1C7','#95672C'],
  ['cream','크림','#FFF1C6','#9B6926'],['rose','장미','#F9DFED','#AC386D'],['burgundy','버건디','#871A43','#FFFFFF'],['slate','회청','#E8EEF4','#3A4B62'],['charcoal','차콜','#444951','#FFFFFF'],['cocoa','코코아','#F0E2D6','#74543D'],['powder','연하늘','#ECF4FC','#32638C'],
  ['pastelblue','파랑 연톤','#C7DAFF','#2856B3'],['blue','파랑','#2869E9','#FFFFFF'],['cyan','시안','#078CCD','#FFFFFF'],['midnight','미드나잇','#152950','#FFFFFF'],['gray','회색','#D5D8E0','#404A59'],['graphite','먹색','#505C6A','#FFFFFF'],['black','검정','#1E2025','#FFFFFF']
 ].map(([id,label,bg,fg],i)=>Object.freeze({id,label,bg,fg,index:i+1}));
 const lookup=new Map(colors.map(c=>[c.id,c]));
 const aliases={"sky":"iceblue","lightblue":"iceblue","purple":"lavender","lightpurple":"lilac","default":"white","lavender-light":"lilac"};
 function get(id){if(typeof id==='object'&&id)return get(id.id);if(!id)return null;const key=aliases[id]||id;return lookup.get(key)||null;}
 function openPicker(initial,cb){
  const dlg=document.createElement('dialog');dlg.className='cd28-palette-dialog';
  let selected=get(initial)?.id||'lavender';
  dlg.innerHTML=`<div class="cd28-palette-heading"><div><strong>일정 색상</strong><p>배경과 글자색 28가지 조합</p></div><button type="button" class="cd28-close" aria-label="닫기">×</button></div><div class="cd28-palette-grid" role="group" aria-label="색상 조합 28개"></div><div class="cd28-palette-bottom"><span class="cd28-selected-preview">Aa</span><span class="cd28-selected-label"></span><button type="button" class="cd28-apply">적용</button></div>`;
  document.body.append(dlg);
  const grid=dlg.querySelector('.cd28-palette-grid'),preview=dlg.querySelector('.cd28-selected-preview'),label=dlg.querySelector('.cd28-selected-label');
  for(const c of colors){const b=document.createElement('button');b.type='button';b.className='cd28-color-choice';b.dataset.color=c.id;b.setAttribute('aria-label',c.label);b.textContent='Aa';b.style.setProperty('--cd28-bg',c.bg);b.style.setProperty('--cd28-fg',c.fg);grid.append(b);}
  function render(){const c=get(selected);for(const b of grid.children){const on=b.dataset.color===selected;b.classList.toggle('is-selected',on);b.setAttribute('aria-pressed',String(on));}preview.style.background=c.bg;preview.style.color=c.fg;label.textContent=c.label+' · 배경·글자색';}
  grid.addEventListener('click',e=>{const b=e.target.closest('button[data-color]');if(b){selected=b.dataset.color;render();}});
  const finish=()=>{if(dlg.open)dlg.close();else dlg.remove();};
  dlg.querySelector('.cd28-apply').addEventListener('click',()=>{try{cb(selected,get(selected));}finally{finish();}});
  dlg.querySelector('.cd28-close').addEventListener('click',finish);
  dlg.addEventListener('close',()=>dlg.remove(),{once:true});
  dlg.addEventListener('click',e=>{if(e.target===dlg)finish();});
  render();dlg.showModal();return dlg;
 }
 window.ClientDeskPalette=Object.freeze({version:'28.1',colors,get,openPicker});
})();

/* Client Desk Mobile v1.2.14 – schedule timing, editable types and default colours.
   Type definitions are stored on this device; event type ID/name/colour are
   stored in Google Calendar extendedProperties.private for interoperability. */
(()=>{
  'use strict';
  const dialog=document.getElementById('eventDialog');
  const form=document.getElementById('eventForm');
  if(!dialog||!form)return;
  const field=n=>form.elements.namedItem(n);
  const type=field('type'),color=field('color');
  const KEY='wwtt_clientdesk_calendar_types_v2';
  const Palette=window.ClientDeskPalette;
  if(!Palette){console.error('Client Desk 색상 초기화 실패');return;}
  const PALETTE=Palette.colors.map(c=>[c.id,c.label,c.bg]);
  const COLOR_MAP=Object.fromEntries(Palette.colors.map(c=>[c.id,c.bg]));
  const DEFAULT=[{id:'work',name:'업무일정',color:'lavender'},
                 {id:'personal',name:'개인일정',color:'iceblue'},
                 {id:'todo',name:'할일',color:'yellow'}];
  const pad=n=>String(n).padStart(2,'0');
  const escapeHTML=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const validCategory=c=>c&&typeof c.id==='string'&&c.id.length<=70&&typeof c.name==='string'&&c.name.trim().length>0&&c.name.length<=35;
  function load(){
    try{
      const saved=JSON.parse(localStorage.getItem(KEY)||'null');
      if(Array.isArray(saved)&&saved.length&&saved.length<=80){
        const seen=new Set();const cleaned=saved.filter(validCategory).filter(c=>!seen.has(c.id)&&seen.add(c.id)).map(c=>({id:c.id,name:c.name.trim(),color:Palette.get(c.color)?.id||'lavender'}));
        if(cleaned.length)return cleaned;
      }
    }catch(e){console.warn('일정 종류 설정 복구 실패',e);}
    return DEFAULT.map(c=>({...c}));
  }
  let categories=load(),lastEventId='',openMode='',openVersion=0;
  const eventCache=new Map();
  function store(){try{localStorage.setItem(KEY,JSON.stringify(categories));}catch(e){console.warn('일정 종류 저장 실패',e);}}
  function category(id){return categories.find(c=>c.id===id);}
  function nameTaken(name,exclude=''){return categories.some(c=>c.id!==exclude&&c.name===name);}
  function report(msg){const el=document.getElementById('toast');if(!el)return;el.textContent=msg;el.classList.add('visible');setTimeout(()=>el.classList.remove('visible'),2800);}
  function refreshSelect(preferred=type.value,includeMissing=false){
    const original=preferred;
    type.replaceChildren(...categories.map(c=>new Option(c.name,c.id)));
    if(includeMissing&&original&&!category(original))type.append(new Option('기존 분류 ('+original+')',original));
    type.value=[...type.options].some(x=>x.value===original)?original:(category('personal')?'personal':categories[0]?.id||'');
  }
  refreshSelect();
  const formGrid=form.querySelector(':scope > .form-grid');
  const typeLabel=type.closest('label');
  const settingsPanel=document.createElement('div');
  settingsPanel.className='panel cd-type-settings';
  settingsPanel.innerHTML='<h2>일정 종류와 기본색</h2><p class="small muted">새 일정의 색상을 종류별로 자동 지정합니다. 기존 일정의 개별 색상은 유지됩니다.</p><button class="soft-btn cd-type-open" type="button">종류 관리</button>';
  const settings=document.getElementById('settingsView');
  if(settings){const before=settings.querySelector('.panel:last-child');if(before)before.before(settingsPanel);else settings.append(settingsPanel);}
  const btn=document.createElement('button');
  btn.type='button';btn.className='cd-type-manage-btn';btn.textContent='종류 관리';
  btn.setAttribute('aria-label','일정 종류 및 기본색 관리');
  if(typeLabel)typeLabel.append(btn);
  const manager=document.createElement('dialog');manager.id='cdTypeManager';manager.className='cd-type-dialog';
  manager.innerHTML=`<div class="cd-type-head"><strong>일정 종류 및 기본색 관리</strong><button class="cd-type-x" type="button" aria-label="닫기">×</button></div>
  <p class="cd-type-description">일정 종류를 추가하거나 이름과 기본색을 변경할 수 있습니다.</p>
  <div class="cd-type-list"></div>
  <section class="cd-type-inline-picker" hidden aria-label="일정 종류 기본색 28색 팔레트">
    <div class="cd-type-picker-title"><strong class="cd-type-edit-target">기본색 선택</strong><button type="button" class="cd-type-picker-close" aria-label="색상 선택 닫기">×</button></div>
    <p class="cd-type-picker-hint">배경과 글자색 조합을 선택하세요.</p>
    <div class="cd28-palette-grid cd-type-choice-grid" role="group" aria-label="28색 팔레트"></div>
    <div class="cd-type-picker-footer"><span class="cd28-inline-color cd-type-choice-preview" aria-label="선택한 색상">Aa</span><span class="cd-type-choice-label"></span><button type="button" class="cd-type-picker-apply">기본색 저장</button></div>
  </section>
  <form class="cd-type-new"><input name="newName" maxlength="35" placeholder="새 일정 종류" aria-label="새 일정 종류" required><button class="cd-type-add" type="submit">추가</button></form>
  <div class="cd-type-footer"><button class="cd-type-done" type="button">완료</button></div>`;
  document.body.append(manager);
  const rows=manager.querySelector('.cd-type-list');
  const inlinePicker=manager.querySelector('.cd-type-inline-picker');
  const choiceGrid=inlinePicker.querySelector('.cd-type-choice-grid');
  const choicePreview=inlinePicker.querySelector('.cd-type-choice-preview');
  const choiceLabel=inlinePicker.querySelector('.cd-type-choice-label');
  const choiceTarget=inlinePicker.querySelector('.cd-type-edit-target');
  let editingCategory='',selectedCategoryColor='';
  for(const entry of Palette.colors){
    const button=document.createElement('button');button.type='button';
    button.className='cd28-color-choice';button.dataset.color=entry.id;
    button.textContent='Aa';button.title=entry.label;button.setAttribute('aria-label',entry.label);
    button.style.setProperty('--cd28-bg',entry.bg);button.style.setProperty('--cd28-fg',entry.fg);
    choiceGrid.append(button);
  }
  function renderChoice(){
    const c=Palette.get(selectedCategoryColor)||Palette.get('lavender');
    for(const button of choiceGrid.children){
      const active=button.dataset.color===c.id;
      button.classList.toggle('is-selected',active);button.setAttribute('aria-pressed',String(active));
    }
    choicePreview.style.setProperty('--cd28-bg',c.bg);choicePreview.style.setProperty('--cd28-fg',c.fg);
    choiceLabel.textContent=c.label;
  }
  function hideInlinePicker(){inlinePicker.hidden=true;editingCategory='';}
  function showInlinePicker(c){
    editingCategory=c.id;selectedCategoryColor=Palette.get(c.color)?.id||'lavender';
    choiceTarget.textContent=c.name+' · 기본색 선택';
    renderChoice();inlinePicker.hidden=false;
    inlinePicker.scrollIntoView?.({block:'nearest'});
  }
  choiceGrid.addEventListener('click',e=>{
    const button=e.target.closest('button[data-color]');if(!button)return;
    selectedCategoryColor=button.dataset.color;renderChoice();
  });
  inlinePicker.querySelector('.cd-type-picker-close').addEventListener('click',hideInlinePicker);
  inlinePicker.querySelector('.cd-type-picker-apply').addEventListener('click',()=>{
    const c=category(editingCategory);if(!c)return hideInlinePicker();
    c.color=selectedCategoryColor;store();
    if(type.value===c.id&&openMode==='new')setEditorColor(c.color);
    hideInlinePicker();draw();report('기본색을 저장했습니다.');
  });

  function colorChip(id){const c=Palette.get(id)||Palette.get('lavender');return `<span class="cd28-inline-color" style="--cd28-bg:${c.bg};--cd28-fg:${c.fg}">Aa</span>`;}
  function draw(){
    rows.replaceChildren();
    categories.forEach(c=>{
      const row=document.createElement('div');row.className='cd-type-row';row.dataset.id=c.id;
      row.innerHTML=`<span class="cd-type-swatch" style="background:${COLOR_MAP[c.color]}"></span>
       <input class="cd-type-name" maxlength="35" value="${escapeHTML(c.name)}" aria-label="${escapeHTML(c.name)} 이름 변경">
       <button type="button" class="cd-type-color cd28-manager-trigger" aria-label="${escapeHTML(c.name)} 기본색 선택" title="28가지 색상 중 선택">${colorChip(c.color)}</button>
       <button type="button" class="cd-type-save" title="이름 변경 저장">저장</button>
       <button type="button" class="cd-type-delete" title="분류 삭제" aria-label="${escapeHTML(c.name)} 삭제">×</button>`;
      rows.append(row);
    });
  }
  function openManager(){hideInlinePicker();draw();if(!manager.open)manager.showModal();}
  btn.addEventListener('click',openManager);
  settingsPanel.querySelector('.cd-type-open').addEventListener('click',openManager);
  manager.querySelector('.cd-type-x').addEventListener('click',()=>manager.close());
  manager.addEventListener('close',hideInlinePicker);
  manager.querySelector('.cd-type-done').addEventListener('click',()=>manager.close());
  manager.querySelector('.cd-type-new').addEventListener('submit',e=>{
    e.preventDefault();const input=manager.querySelector('[name=newName]');const name=input.value.trim();
    if(!name||name.length>35){report('종류 이름을 확인해 주세요.');return;}
    if(nameTaken(name)){report('이미 있는 일정 종류입니다.');return;}
    if(categories.length>=60){report('일정 종류는 최대 60개입니다.');return;}
    const id='custom_'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+Math.random().toString(36).slice(2));
    categories.push({id,name,color:'lavender'});store();refreshSelect(type.value);draw();input.value='';report('일정 종류를 추가했습니다.');
  });
  rows.addEventListener('click',e=>{
    const row=e.target.closest('.cd-type-row');if(!row)return;
    const c=category(row.dataset.id);if(!c)return;
    if(e.target.closest('.cd-type-color')){showInlinePicker(c);return;}
    if(e.target.closest('.cd-type-save')){
      const name=row.querySelector('.cd-type-name').value.trim();
      if(!name||name.length>35){report('이름을 1~35자로 입력해 주세요.');return;}
      if(nameTaken(name,c.id)){report('같은 이름의 일정 종류가 있습니다.');return;}
      c.name=name;store();refreshSelect(type.value);draw();report('변경사항을 저장했습니다.');
    }
    if(e.target.closest('.cd-type-delete')){
      if(categories.length<=1){report('일정 종류는 최소 한 개가 필요합니다.');return;}
      if(!confirm(`‘${c.name}’ 종류를 삭제하시겠습니까? 기존 일정은 삭제되지 않습니다.`))return;
      categories=categories.filter(x=>x.id!==c.id);store();refreshSelect(type.value);if(editingCategory===c.id)hideInlinePicker();draw();
      if(dialog.open&&openMode==='new')setEditorColor(category(type.value)?.color||'white');
      report('일정 종류를 삭제했습니다.');
    }
  });
  // Keep the native colour select for app.js serialization, but replace its UI with
  // the same 28-color popup used by PC. Do not rewrite the original save handler.
  for(const c of Palette.colors){if(![...color.options].some(o=>o.value===c.id))color.add(new Option(c.label,c.id));}
  const nativeColorLabel=color.closest('label');
  const editorButton=document.createElement('button');editorButton.type='button';
  editorButton.className='cd28-event-color-trigger';editorButton.setAttribute('aria-label','일정 색상 선택');
  function syncEditorColor(){const c=Palette.get(color.value)||Palette.get('white');
    editorButton.innerHTML=`<span class="cd28-inline-color" style="--cd28-bg:${c.bg};--cd28-fg:${c.fg}">Aa</span><span>${escapeHTML(c.label)} · 색상 선택</span><span class="cd28-chevron">⌄</span>`;
  }
  function setEditorColor(id){if(!Palette.get(id))return;color.value=id;syncEditorColor();color.dispatchEvent(new Event('change',{bubbles:false}));}
  if(nativeColorLabel){color.classList.add('cd28-native-color-select');nativeColorLabel.append(editorButton);}
  editorButton.addEventListener('click',()=>Palette.openPicker(color.value,setEditorColor));
  color.addEventListener('change',syncEditorColor);
  syncEditorColor();
  type.addEventListener('change',()=>{const c=category(type.value);if(c)setEditorColor(c.color);});
  // Preserve the explicitly selected colour for edited and copied events.
  function onDialogOpen(){
    const version=++openVersion;
    openMode=document.getElementById('eventModalTitle')?.textContent?.includes('새 일정')?'new':'existing';
    // The application's synchronous openEvent handler is finished when the observer runs.
    if(!dialog.open)return;
    if(!type.value)refreshSelect(category('personal')?'personal':categories[0]?.id);
    if(openMode==='new'){
      const c=category(type.value);if(c)setEditorColor(c.color);
    }else if(lastEventId){
      const cached=eventCache.get(lastEventId),props=cached?.extendedProperties?.private;
      const id=props?.clientDeskType;
      if(props?.clientDeskColor&&Palette.get(props.clientDeskColor))setEditorColor(props.clientDeskColor);
      if(id&&!category(id)&&type.value!==id){
        if(![...type.options].some(o=>o.value===id))type.append(new Option(props.clientDeskTypeName||id,id));
        type.value=id;
      }
    }
    if(version===openVersion)lastEventId='';
  }
  new MutationObserver(()=>{if(dialog.open)onDialogOpen();}).observe(dialog,{attributes:true,attributeFilter:['open']});
  dialog.addEventListener('close',()=>{openMode='';lastEventId='';});
  document.getElementById('dayEvents')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-event-id]');if(btn)lastEventId=btn.dataset.eventId||'';
  },true);
  // Existing and new categories use Google Calendar metadata; updates are
  // restricted to actual event create/edit payloads (not trash/complete PATCHes).
  const fetchBase=window.fetch.bind(window);
  const CALENDAR=/^https:\/\/www\.googleapis\.com\/calendar\/v3\/calendars\/[^/?]+\/events(?:[/?#]|$)/;
  function observeEvents(data){
    const entries=Array.isArray(data?.items)?data.items:data?.id?[data]:[];
    let anyAdded=false;
    for(const ev of entries){
      if(!ev?.id)continue;eventCache.set(ev.id,ev);
      const props=ev.extendedProperties?.private||{};
      if(props.clientDeskType&&!category(props.clientDeskType)&&categories.length<60){
        categories.push({id:props.clientDeskType,name:props.clientDeskTypeName||props.clientDeskType,color:COLOR_MAP[props.clientDeskTypeDefaultColor]?props.clientDeskTypeDefaultColor:(COLOR_MAP[props.clientDeskColor]?props.clientDeskColor:'white')});anyAdded=true;
      }
    }
    if(anyAdded){store();refreshSelect(type.value);}
    queueDecorate();
  }
  window.fetch=async function cdCategoryFetch(resource,opts){
    let url='';try{url=typeof resource==='string'?resource:resource instanceof URL?resource.href:resource?.url||'';}catch{}
    if(!CALENDAR.test(url))return fetchBase(resource,opts);
    const method=String(opts?.method||'GET').toUpperCase();
    let next=opts;
    if(dialog.open&&['POST','PATCH','PUT'].includes(method)&&typeof opts?.body==='string'){
      try{
        const payload=JSON.parse(opts.body);
        if(payload?.summary&&payload?.start&&payload?.end){
          payload.extendedProperties ||= {};
          payload.extendedProperties.private ||= {};
          const c=category(type.value),chosen=Palette.get(color.value)||Palette.get(c?.color);
          if(c){payload.extendedProperties.private.clientDeskType=c.id;payload.extendedProperties.private.clientDeskTypeName=c.name;
            payload.extendedProperties.private.clientDeskTypeDefaultColor=c.color;}
          if(chosen){payload.extendedProperties.private.clientDeskColor=chosen.id;
            payload.extendedProperties.private.clientDeskColorBg=chosen.bg;
            payload.extendedProperties.private.clientDeskColorText=chosen.fg;}
          next={...opts,body:JSON.stringify(payload)};
        }
      }catch(e){console.warn('일정 분류 저장',e);}
    }
    const response=await fetchBase(resource,next);
    if(response.ok&&['GET','POST','PUT','PATCH'].includes(method)){
      response.clone().json().then(observeEvents).catch(()=>{});
    }
    return response;
  };
  // Colour dots on schedule cards and dates, without rebuilding the app's own calendar.
  const dayEvents=document.getElementById('dayEvents'),monthGrid=document.getElementById('monthGrid');
  function startDay(ev){return ev?.start?.date||ev?.start?.dateTime?.slice(0,10)||'';}
  function endDay(ev){return ev?.end?.date||ev?.end?.dateTime?.slice(0,10)||startDay(ev);}
  function activeOn(ev,day){const a=startDay(ev),b=endDay(ev);if(!a||!b)return false;if(ev?.start?.date)return a<=day&&day<b;return a<=day&&day<=b;}
  function eventPalette(ev){const props=ev?.extendedProperties?.private||{};
    return Palette.get(props.clientDeskColor)||Palette.get(category(props.clientDeskType)?.color)||Palette.get('white');}
  function eventColor(ev){return eventPalette(ev).bg;}
  let pending=false;
  function decorate(){
    pending=false;
    dayEvents?.querySelectorAll('[data-event-id]').forEach(btn=>{
      const ev=eventCache.get(btn.dataset.eventId);if(!ev)return;
      const card=btn.closest('.event-card')||btn;
      const scheme=eventPalette(ev);
      card.style.setProperty('--cd-event-color',scheme.bg);
      card.style.setProperty('--cd-event-text',scheme.fg);
      card.dataset.cd28Colored='1';
    });
    monthGrid?.querySelectorAll('[data-event-id]').forEach(item=>{
      const ev=eventCache.get(item.dataset.eventId);if(!ev)return;const c=eventPalette(ev);
      item.style.setProperty('--cd-event-color',c.bg);
      item.style.setProperty('--cd-event-text',c.fg);
      item.dataset.cd28Colored='1';
    });
    monthGrid?.querySelectorAll('[data-day]').forEach(btn=>{
      const arr=[...eventCache.values()].filter(ev=>activeOn(ev,btn.dataset.day)).sort((a,b)=>(a.start?.dateTime||a.start?.date||'').localeCompare(b.start?.dateTime||b.start?.date||''));
      const dots=btn.querySelectorAll('.calendar-dots b');dots.forEach((d,i)=>{if(arr[i])d.style.background=eventColor(arr[i]);});
    });
  }
  function queueDecorate(){if(pending)return;pending=true;requestAnimationFrame(decorate);}
  if(dayEvents)new MutationObserver(queueDecorate).observe(dayEvents,{childList:true,subtree:true});
  if(monthGrid)new MutationObserver(queueDecorate).observe(monthGrid,{childList:true,subtree:true});
  // Read the existing calendar snapshot without modifying it.
  try{
    const dbReq=indexedDB.open('wwtt-mobile-clientdesk-v1');
    dbReq.onupgradeneeded=()=>{try{dbReq.transaction.abort();}catch{}};
    dbReq.onsuccess=()=>{
      const db=dbReq.result;
      if(!db.objectStoreNames.contains('data')){db.close();return;}
      const req=db.transaction('data','readonly').objectStore('data').get('calendar-snapshot-v1');
      req.onsuccess=()=>{observeEvents(req.result);db.close();};
      req.onerror=()=>db.close();
    };
  }catch{}

  // End time follows only if the user moves the start to/after the current end.
  // Use local date parts, not Date.parse with UTC conversion, for predictable rollover.
  const startDate=field('date'),endDate=field('endDate'),startTime=field('start'),endTime=field('end'),allDay=field('allDay');
  function parts(date,time){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return null;
    const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number);
    const t=new Date(y,m-1,d,h,min,0,0);
    return t.getFullYear()===y&&t.getMonth()===m-1&&t.getDate()===d&&t.getHours()===h&&t.getMinutes()===min?t:null;
  }
  function dateValue(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function timeValue(d){return `${pad(d.getHours())}:${pad(d.getMinutes())}`;}
  function reconcile(){
    if(!dialog.open||!startDate?.value||!endDate)return;
    if(allDay?.checked){if(!endDate.value||endDate.value<startDate.value)endDate.value=startDate.value;return;}
    const begin=parts(startDate.value,startTime?.value),finish=parts(endDate.value,endTime?.value);
    if(!begin||!finish)return;
    if(begin.getTime()>=finish.getTime()){
      const next=new Date(begin.getTime()+30*60*1000);
      endDate.value=dateValue(next);endTime.value=timeValue(next);
      // Native and custom time pickers both read directly from the end input.
      endDate.dispatchEvent(new Event('input',{bubbles:false}));
      endTime.dispatchEvent(new Event('input',{bubbles:false}));
    }
  }
  for(const el of [startDate,startTime]){
    el?.addEventListener('input',reconcile);el?.addEventListener('change',reconcile);
  }
  allDay?.addEventListener('change',reconcile);
  // PC and mobile helpers can share the same regression-testable pure function.
  window.ClientDeskScheduleTiming={parts,dateValue,timeValue,adjust:(date,time)=>{
    const v=parts(date,time);if(!v)return null;const e=new Date(v.getTime()+1800000);return {date:dateValue(e),time:timeValue(e)};
  }};
})();
