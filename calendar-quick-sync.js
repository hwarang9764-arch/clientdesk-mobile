/* Client Desk mobile calendar quick sync. Reuses the app's existing sync action. */
(()=>{
 'use strict';
 if(window.__cdCalendarQuickSync21)return;window.__cdCalendarQuickSync21=true;
 function init(){
  const row=document.querySelector('.cd-calendar-sync-row');
  const calendar=document.getElementById('calendarView');
  const status=document.getElementById('statusBar');
  const sourceText=document.getElementById('statusText');
  const sourceDot=document.getElementById('statusDot');
  const targetText=document.getElementById('cdCalendarStatusText');
  const targetDot=document.getElementById('cdCalendarStatusDot');
  const sync=document.getElementById('cdCalendarQuickSync');
  if(!row||!calendar||!status||!sourceText||!targetText||!sync)return;
  function copyStatus(){
    targetText.textContent=sourceText.textContent||'동기화 상태 확인 중';
    if(sourceDot&&targetDot){targetDot.className=sourceDot.className+' cd-calendar-status-dot';}
    row.title=targetText.textContent;
  }
  function isVisible(){
    return !calendar.hidden&&calendar.getAttribute('aria-hidden')!=='true'&&
      window.getComputedStyle(calendar).display!=='none';
  }
  function updateView(){document.body.classList.toggle('cd-calendar-visible',isVisible());copyStatus();}
  // Reconnect is NOT the same as Drive data synchronization. The old quick
  // button only clicked #headerSync/#syncNow and never refreshed Google OAuth.
  let busy=false;
  function toast(message){
    const el=document.getElementById('toast');
    if(el){el.textContent=message;el.classList.add('visible');}
  }
  sync.addEventListener('click',()=>{
    if(busy)return;
    const connect=document.getElementById('connectGoogle');
    const info=document.getElementById('googleInfo');
    const oldSync=document.getElementById('headerSync')||document.getElementById('syncNow');
    if(!connect){toast('Google 계정 연결 버튼을 찾지 못했습니다. 설정에서 연결을 확인해 주세요.');return;}
    // Trigger the OAuth action synchronously inside a real user gesture so
    // Google's popup can open on Android/iOS. Do not claim connection before verified.
    if(connect.disabled){toast('Google 계정 연결이 진행 중입니다.');return;}
    busy=true;sync.disabled=true;
    const original=sync.title;
    sync.title='Google 계정 다시 연결 중';
    const before=info?.textContent||'';
    let finished=false;
    const complete=(ok,verified=true)=>{
      if(finished)return;
      finished=true;watcher?.disconnect();clearTimeout(timer);
      busy=false;sync.disabled=false;sync.title=original;
      if(ok){
        if(verified){toast('Google 계정 연결을 확인했습니다. 동기화를 요청합니다.');
          if(oldSync&&!oldSync.disabled&&oldSync!==sync)oldSync.click();}
      }else{toast('Google 연결을 확인하지 못했습니다. 설정 → Google 계정 다시 연결을 확인해 주세요.');}
    };
    const looksConnected=t=>/Google\s*연결됨|연결됨|로그인\s*세션|connected/i.test(t)&&!/(연결되지|실패|오류|만료|disconnect)/i.test(t);
    const watcher=info?new MutationObserver(()=>{
      const current=info.textContent||'';
      if(current!==before&&looksConnected(current))complete(true);
      if(/실패|오류|만료|거부|취소/.test(current)&&current!==before)complete(false);
    }):null;
    if(watcher)watcher.observe(info,{childList:true,subtree:true,characterData:true});
    const timer=setTimeout(()=>complete(false),25000);
    try{connect.click();}catch(error){complete(false);return;}
    // If an existing Google session is silently renewed, its status text may
    // not change. Run the legacy sync action as a fallback, without claiming
    // authentication succeeded; the host app reports its own API errors.
    setTimeout(()=>{
      if(finished)return;
      if(looksConnected(info?.textContent||'')){
        if(oldSync&&!oldSync.disabled&&oldSync!==sync)oldSync.click();
        toast('Google 계정 재연결과 동기화를 요청했습니다. 결과를 확인해 주세요.');
        complete(true,false);
      }
    },2200);
  });
  new MutationObserver(copyStatus).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  new MutationObserver(updateView).observe(calendar,{attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});
  for(const tab of document.querySelectorAll('[data-view]'))tab.addEventListener('click',()=>setTimeout(updateView,0));
  copyStatus();updateView();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
