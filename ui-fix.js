/* Client Desk Mobile v1.2.29: view-only refinements. Core application and sync are untouched. */
(()=>{
  'use strict';
  const COPY_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const fields=document.getElementById('clientFields');
  if(fields){
    const decorate=()=>{
      for(const button of fields.querySelectorAll('button.inline-copy:not([data-icon-ready])')){
        const label=button.closest('label');
        const input=label?.querySelector('input,textarea');
        const name=(label?.firstChild?.textContent||input?.name||'').trim();
        button.dataset.iconReady='1';
        button.setAttribute('aria-label',`${name} 복사`);
        button.title=`${name} 복사`;
        button.innerHTML=COPY_SVG;
      }
    };
    new MutationObserver(decorate).observe(fields,{subtree:true,childList:true});
    decorate();
  }

  // Keep original button instances and their data attributes/event delegation intact.
  // Only move + 일정 and the status pill into a vertical right-side control stack.
  const list=document.getElementById('clientList');
  if(list){
    const alignCardActions=()=>{
      for(const card of list.querySelectorAll('.client-card:not([data-action-stack-ready])')){
        const header=card.querySelector('.client-card-head');
        if(!header)continue;
        const left=header.firstElementChild;
        const addEvent=left?.querySelector('button.client-quick-event[data-client-event]');
        const statePill=Array.from(header.children).find(child=>child.classList.contains('pill'));
        if(!addEvent||!statePill)continue;
        const stack=document.createElement('div');
        stack.className='client-card-action-stack';
        stack.append(addEvent,statePill);
        header.append(stack);
        card.dataset.actionStackReady='1';
      }
    };
    new MutationObserver(alignCardActions).observe(list,{childList:true});
    alignCardActions();
  }

  // A completed calendar event used to get a green border on its action
  // button even when the event card itself was blue, violet, etc. Keep the
  // original button (and click listener) and only give it a styling hook.
  const dayEvents=document.getElementById('dayEvents');
  if(dayEvents){
    const matchDoneButtons=()=>{
      for(const card of dayEvents.querySelectorAll('.event-card')){
        for(const button of card.querySelectorAll('button')){
          if(/완료(?:\s*취소)?/.test((button.textContent||'').replace(/\s+/g,' '))){
            button.classList.add('cd29-event-complete');
          }
        }
      }
    };
    new MutationObserver(matchDoneButtons).observe(dayEvents,{
      childList:true,characterData:true,subtree:true
    });
    matchDoneButtons();
  }

  // UI version matches the released visual patch; core sync schema remains unchanged.
  const version=document.getElementById('appVersion');
  if(version){
    const showVersion=()=>{
      if(version.textContent!=='1.2.29')version.textContent='1.2.29';
    };
    new MutationObserver(showVersion).observe(version,{childList:true,characterData:true,subtree:true});
    showVersion();
  }
})();
