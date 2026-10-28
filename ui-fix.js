/* Client Desk Mobile v1.2.6: enhance existing copy buttons without replacing their handlers. */
(()=>{
  'use strict';
  const SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>';
  const fields=document.getElementById('clientFields');
  if(!fields)return;
  const decorate=()=>{
    for(const button of fields.querySelectorAll('button.inline-copy:not([data-icon-ready])')){
      const label=button.closest('label');
      const input=label?.querySelector('input,textarea');
      button.dataset.iconReady='1';
      const name=(label?.firstChild?.textContent||input?.name||'').trim();
      button.setAttribute('aria-label',`${name} 복사`);
      button.title=`${name} 복사`;
      button.innerHTML=SVG;
    }
  };
  new MutationObserver(decorate).observe(fields,{subtree:true,childList:true});
  decorate();
  // The UI patch is versioned independently; the original sync/core app stays untouched.
  const version=document.getElementById('appVersion');
  if(version){
    const show=()=>{if(version.textContent!=='1.2.6')version.textContent='1.2.6';};
    new MutationObserver(show).observe(version,{childList:true,characterData:true,subtree:true});
    show();
  }
})();
