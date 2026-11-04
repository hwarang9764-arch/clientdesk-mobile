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
  sync.addEventListener('click',()=>{
    // Use the existing header action; no duplicate network requests or tokens.
    const existing=document.getElementById('headerSync')||document.getElementById('syncNow');
    if(existing&&existing!==sync&&!existing.disabled){existing.click();return;}
    const notice=document.getElementById('toast');
    if(notice){notice.textContent='동기화 버튼을 사용할 수 없습니다. 설정에서 연결 상태를 확인해 주세요.';notice.classList.add('visible');setTimeout(()=>notice.classList.remove('visible'),3000);}
  });
  new MutationObserver(copyStatus).observe(status,{childList:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});
  new MutationObserver(updateView).observe(calendar,{attributes:true,attributeFilter:['hidden','style','class','aria-hidden']});
  for(const tab of document.querySelectorAll('[data-view]'))tab.addEventListener('click',()=>setTimeout(updateView,0));
  copyStatus();updateView();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
