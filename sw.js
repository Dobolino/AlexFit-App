const CACHE_NAME='af-v23-web-push-20261116';
const APP_FILES=['./','./index.html','./exercise-videos.js','./coach-core.js','./training-plans.js','./coach.js','./coach-recipes.js','./coach-tools.js','./release.json','./coach.css','./app-ui.css','./training-plans-gym.js','./gym-setup-ui.js','./push-config.js','./push-ui.js','./push-ui.css','./push-timers.js','./ui-shell.js','./strength-ui.js','./strength-ui.css','./cardio-ui.js','./cardio-ui.css','./recipe-library.json','./manifest.webmanifest','./icons/icon.svg'];
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
const PUSH_TYPES=new Set(['rest','cardio-rest','cardio-work','cardio-finish','training-reminder','test']);
function pushScope(){
 return new URL(self.registration?.scope||'./',self.location.href||self.location.origin+'/');
}
function scopedPushURL(value){
 const scope=pushScope();
 try{
  const url=new URL(typeof value==='string'?value:scope.href,scope);
  const decoded=decodeURIComponent(url.pathname);
  if(url.origin!==scope.origin||url.username||url.password||
     !url.pathname.startsWith(scope.pathname)||/%2f|%5c/i.test(url.pathname)||
     decoded.includes('\\')||decoded.split('/').some(part=>part==='..'))return scope.href;
  return url.href;
 }catch(_){return scope.href;}
}
function pushText(value,fallback,max){
 if(typeof value!=='string')return fallback;
 return value.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max)||fallback;
}
function normalizePush(value){
 const data=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const type=PUSH_TYPES.has(data.type)?data.type:'info';
 const expired=typeof data.expiresAt==='number'&&Number.isFinite(data.expiresAt)&&data.expiresAt<Date.now();
 const title=expired?'AlexFit':pushText(data.title,'AlexFit',80);
 const body=expired?'Ein Trainingshinweis ist inzwischen abgelaufen. Öffne AlexFit für den aktuellen Stand.':
  pushText(data.body,'Dein Trainingshinweis ist da. Öffne AlexFit für den aktuellen Stand.',240);
 const tag=pushText(data.tag,type,64).replace(/[^a-zA-Z0-9:_-]/g,'-');
 return{title,options:{body,tag:'af-push-'+tag,icon:new URL('icons/icon.svg',pushScope()).href,
  data:{url:scopedPushURL(data.url),notificationType:type}}};
}
self.addEventListener('push',event=>{
 let payload;
 try{payload=event.data?.json();}catch(_){payload=null;}
 const notification=normalizePush(payload);
 // Web Push is user-visible on iOS, including when a window is already focused.
 // Do not silently swallow malformed or late pushes: use a harmless visible hint.
 event.waitUntil(self.registration.showNotification(notification.title,notification.options));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const data=event.notification.data||{};
 const url=scopedPushURL(data.url);
 const notificationType=PUSH_TYPES.has(data.notificationType)?data.notificationType:'info';
 event.waitUntil((async()=>{
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  const scope=pushScope();
  const existing=windows.find(window=>{
   try{const candidate=new URL(window.url);return candidate.origin===scope.origin&&candidate.pathname.startsWith(scope.pathname);}
   catch(_){return false;}
  });
  if(existing){
   // Route in the existing page without reloading an in-progress workout.
   existing.postMessage({type:'AF_PUSH_OPEN',notificationType,url});
   return existing.focus();
  }
  return clients.openWindow(url);
 })());
});
self.addEventListener('pushsubscriptionchange',event=>{
 // Subscription credentials are owned by the page; reconnect on its next launch
 // or immediately when an existing AlexFit window receives this message.
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
  const scope=pushScope();
  for(const window of windows){
   try{
    const url=new URL(window.url);
    if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname))
     window.postMessage({type:'AF_PUSH_SUBSCRIPTION_CHANGED'});
   }catch(_){}
  }
 }));
});
