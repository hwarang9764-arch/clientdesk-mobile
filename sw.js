/* Static PWA shell; network-first updates files when the app starts online.
 * Offline requests fall back to the most recently cached version. */
const CACHE_VERSION='wwtt-mobile-v1.2.3';
const STATIC=['./','./index.html','./app.js','./style.css','./drive-crypto.js','./holidays.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE_VERSION).then(cache=>cache.addAll(STATIC))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('wwtt-mobile-')&&name!==CACHE_VERSION)await caches.delete(name);await clients.claim();})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(req);
   if(response.ok){const clone=response.clone();const cache=await caches.open(CACHE_VERSION);cache.put(req,clone).catch(()=>{});}
   return response;
  }catch{
   return (await caches.match(req))||(req.mode==='navigate'?await caches.match('./index.html'):Response.error());
  }
 })());
});
