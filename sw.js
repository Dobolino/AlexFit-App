const CACHE_NAME='af-v17-workout-ui-20261026';
const APP_FILES=['./','./index.html','./coach-core.js','./training-plans.js','./coach.js','./coach-recipes.js','./coach.css','./recipe-library.json','./manifest.webmanifest','./icons/icon.svg'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(APP_FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('af-')&&key!==CACHE_NAME).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const network=fetch(event.request).then(async response=>{
  if(response.ok){const cache=await caches.open(CACHE_NAME);await cache.put(event.request,response.clone());}
  return response;
 });
 event.waitUntil(network.catch(()=>{}));
 event.respondWith((async()=>{
  let timeout;
  try{
   if(event.request.mode!=='navigate')return await network;
   return await Promise.race([network,new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('offline timeout')),3000);})]);
  }catch(error){
   const cache=await caches.open(CACHE_NAME);
   const cached=await cache.match(event.request,{ignoreSearch:true});
   if(cached)return cached;
   if(event.request.mode==='navigate'){
    const index=await cache.match('./index.html');if(index)return index;
   }
   return new Response('Offline: Diese Datei wurde noch nicht gespeichert.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }finally{if(timeout)clearTimeout(timeout);}
 })());
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  const existing=windows.find(w=>new URL(w.url).origin===self.location.origin);
  if(existing)return existing.focus();
  return clients.openWindow('./');
 }));
});
