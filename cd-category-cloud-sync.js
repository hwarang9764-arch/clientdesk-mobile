/* ClientDesk category configuration sync. Shared, non-sensitive category names,
 * order, and colour IDs are stored in a dedicated JSON file in the SAME user's
 * Google Drive. Existing client data and calendar files are never modified.
 * Uses an in-memory OAuth access token already supplied by the host app. */
(()=>{
 'use strict';
 if(window.ClientDeskCategorySync)return;
 const KEY='wwtt_clientdesk_calendar_types_v2';
 const STAMP='wwtt_clientdesk_calendar_types_cloud_revision';
 const FILENAME='ClientDesk_calendar_types_v1.json';
 const BASE='https://www.googleapis.com/drive/v3/files';
 const UPLOAD='https://www.googleapis.com/upload/drive/v3/files';
 const subscribers=new Set();
 const localFetch=window.fetch.bind(window);
 let token='',fileId='',busy=false,pending=false,lastPull=0,delayed=0;
 const safe=x=>Array.isArray(x)?x.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.color==='string').slice(0,60).map(c=>({id:c.id.slice(0,90),name:c.name.slice(0,35),color:c.color})):[];
 const getLocal=()=>{try{return safe(JSON.parse(localStorage.getItem(KEY)||'[]'));}catch{return [];}};
 const getStamp=()=>{try{return Number(localStorage.getItem(STAMP)||0)||0;}catch{return 0;}};
 function authHeader(args){
   const headers=args?.headers;
   let value='';
   if(headers instanceof Headers)value=headers.get('authorization')||'';
   else if(Array.isArray(headers))value=(headers.find(([k])=>/^authorization$/i.test(k))||[])[1]||'';
   else if(headers&&typeof headers==='object')value=headers.Authorization||headers.authorization||'';
   return typeof value==='string'&&/^Bearer\s+\S+$/i.test(value)?value.slice(7).trim():'';
 }
 function queue(force=false){
   if(!token)return;
   if(!force&&Date.now()-lastPull<80000)return;
   clearTimeout(delayed);delayed=setTimeout(()=>pullAndPush().catch(()=>{}),600);
 }
 window.fetch=function(resource,options){
   try{
     const url=typeof resource==='string'?resource:resource?.url||'';
     if(/^https:\/\/www\.googleapis\.com\/(?:drive|calendar)\//.test(url)){
       const bearer=authHeader(options)||authHeader(resource);
       if(bearer&&bearer!==token){token=bearer;lastPull=0;queue();}
       else if(bearer)queue();
     }
   }catch{}
   return localFetch(resource,options);
 };
 async function request(url,options={}){
   const resp=await localFetch(url,{...options,headers:{Authorization:'Bearer '+token,...options.headers}});
   if(!resp.ok){if(resp.status===401||resp.status===403){lastPull=Date.now();}throw new Error('Drive settings '+resp.status);}
   return resp;
 }
 async function findFile(){
   if(fileId)return fileId;
   const query=new URLSearchParams({q:`name = '${FILENAME}' and trashed = false`,spaces:'drive',fields:'files(id,name),nextPageToken',pageSize:'10'});
   const data=await (await request(BASE+'?'+query)).json();
   fileId=data.files?.[0]?.id||'';return fileId;
 }
 async function upload(data){
   if(!fileId){
     const created=await(await request(BASE+'?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:FILENAME,mimeType:'application/json'})})).json();
     fileId=created.id;
   }
   await request(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 }
 async function pullAndPush(){
   if(!token||busy){pending=true;return;}
   busy=true;
   try{
     lastPull=Date.now();await findFile();
     let remote=null;
     if(fileId){try{remote=await (await request(`${BASE}/${encodeURIComponent(fileId)}?alt=media`)).json();}catch{} }
     const local={version:1,updatedAt:getStamp(),categories:getLocal()};
     if(remote&&Array.isArray(remote.categories)&&Number(remote.updatedAt)>local.updatedAt){
       const incoming=safe(remote.categories);
       if(incoming.length){
         localStorage.setItem(KEY,JSON.stringify(incoming));
         localStorage.setItem(STAMP,String(remote.updatedAt));
         for(const callback of subscribers){try{callback(incoming);}catch(e){console.warn('ClientDesk categories update',e);}}
         window.dispatchEvent(new CustomEvent('clientdesk-categories-synced',{detail:{categories:incoming}}));
       }
     }else if(local.categories.length&&(!remote||local.updatedAt>Number(remote.updatedAt))){
       if(!local.updatedAt){local.updatedAt=Date.now();localStorage.setItem(STAMP,String(local.updatedAt));}
       await upload(local);
     }
   }catch(e){
     // A missing Drive permission must never affect calendar operations or data.
     console.debug('[ClientDesk] Category sync unavailable; saved locally:',e.message);
   }finally{busy=false;if(pending){pending=false;lastPull=0;queue(true);}}
 }
 function notifySaved(){
   localStorage.setItem(STAMP,String(Date.now()));
   if(token){lastPull=0;queue(true);}
 }
 window.addEventListener('focus',()=>{if(token&&Date.now()-lastPull>80000)queue(true);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&token)queue(true);});
 window.ClientDeskCategorySync=Object.freeze({
   getAccessToken(){return token;},
   subscribe(fn){subscribers.add(fn);return ()=>subscribers.delete(fn);},
   notifySaved,refresh(){lastPull=0;queue(true);},
   status(){return {authorized:!!token,lastCheck:lastPull};}
 });
})();
