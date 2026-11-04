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
