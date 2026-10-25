import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {photo as fixture} from './webp-fixture.mjs';
const base=process.env.SMOKE_API_BASE||'http://localhost:8796';
const origin='http://localhost:5196';
async function call(path,init={},expected=200){const r=await fetch(base+path,{...init,headers:{Origin:origin,...init.headers}});const d=await r.json();assert.equal(r.status,expected,JSON.stringify(d));return d;}
const data={region:'hk',market:'ssp',street:'ki-lung',name:'測試手作攤',by:'測試攤主',category:'art',color:'#e86a5c',sign:'慢慢揀',note:'本機測試',igUrl:'https://www.instagram.com/',shopUrl:'',email:`smoke-${Date.now()}@example.invalid`,items:[{name:'作品',price:100}],own:true,consent:true};
const form=(d,photo)=>{const f=new FormData();f.set('data',JSON.stringify(d));if(photo)f.set('photo0',new Blob([photo],{type:'image/webp'}),'test.webp');return f;};
try{
 await call('/api/stalls?region=hk');
 await call('/api/apply',{method:'POST',body:form({...data,name:''})},400);
 console.log('通過：欄位驗證錯誤路徑');
 const denied=await fetch(base+'/api/stalls?region=hk',{headers:{Origin:'https://invalid.example'}});assert.equal(denied.status,403);console.log('通過：CORS 拒絕未知來源');
 await call('/api/manage',{},401);console.log('通過：管理端拒絕無 token 請求');
 {
 const photo=process.env.SMOKE_PHOTO?await readFile(process.env.SMOKE_PHOTO):fixture;let token;
 try{
 const a=await call('/api/apply',{method:'POST',body:form(data,photo)},201);token=a.token;const auth={Authorization:'Bearer '+token};const m=await call('/api/manage',{headers:auth});const id=m.draft.id;
 let list=await call('/api/stalls?region=hk');assert.ok(!list.stalls.some(s=>s.id===id));console.log('通過：待審攤不公開');
 await call('/api/admin/approve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
 list=await call('/api/stalls?region=hk');assert.ok(list.stalls.some(s=>s.id===id));assert.ok(!/email|token/i.test(JSON.stringify(list)));console.log('通過：核准後公開且沒有 email／token');
 const managed=await call('/api/manage',{headers:auth});assert.equal(managed.status,'live');
 await call('/api/manage',{method:'PUT',headers:auth,body:form({...data,name:'修改待審',keepPhotos:managed.live.photos})});
 const revised=await call('/api/manage',{headers:auth});assert.equal(revised.status,'pending');assert.equal(revised.draft.name,'修改待審');assert.equal(revised.live.name,data.name);
 list=await call('/api/stalls?region=hk');assert.equal(list.stalls.find(s=>s.id===id).name,data.name);console.log('通過：修改待審期間保留公開舊版');
 await call('/api/manage',{method:'DELETE',headers:auth});token=undefined;
 list=await call('/api/stalls?region=hk');assert.ok(!list.stalls.some(s=>s.id===id));console.log('通過：管理 GET／PUT／DELETE');
 }finally{if(token)await call('/api/manage',{method:'DELETE',headers:{Authorization:'Bearer '+token}});}
 }
}catch(e){console.error('失敗：'+e.message);process.exitCode=1;}
