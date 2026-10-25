import assert from 'node:assert/strict';
import {validate} from '../src/validate.ts';
import {allocateSlot} from '../worker/src/slots.ts';
import {verifyJWT} from '../worker/src/auth.ts';
import {webpSize} from '../worker/src/photos.ts';
const valid={region:'hk',market:'ssp',street:'ki-lung',name:'手作',by:'阿晴',category:'art',color:'#e86a5c',sign:'',note:'',igUrl:'https://www.instagram.com/',shopUrl:'',email:'maker@example.invalid',items:[{name:'畫',price:0}],own:true,consent:true};
let count=0;const test=(name,fn)=>{fn();count++;console.log('通過：'+name);};
test('完整資料及 1–3 張照片',()=>{assert.deepEqual(validate(valid,1),{});assert.deepEqual(validate(valid,3),{});for(const n of [0,4])assert.ok(validate(valid,n).photos);});
test('字數依 Unicode code point，包括 emoji',()=>{assert.ok(!validate({...valid,name:'😀'.repeat(20),by:'😀'.repeat(12),sign:'😀'.repeat(6),note:'😀'.repeat(40)},1).name);for(const [k,n] of [['name',21],['by',13],['sign',7],['note',41]])assert.ok(validate({...valid,[k]:'😀'.repeat(n)},1)[k]);assert.ok(validate({...valid,name:'   '},1).name);});
test('IG 限定 HTTPS 與精確 host',()=>{for(const u of ['http://instagram.com/a','https://instagram.com.evil.invalid/a','https://evil.invalid/?instagram.com','https://u:p@instagram.com/a','javascript:alert(1)'])assert.ok(validate({...valid,igUrl:u},1).igUrl);for(const u of ['https://instagram.com/a','https://www.instagram.com/a'])assert.ok(!validate({...valid,igUrl:u},1).igUrl);});
test('商品價格與名稱邊界',()=>{for(const n of [-1,100000,.5,NaN,Infinity,'1'])assert.ok(validate({...valid,items:[{name:'杯',price:n}]},1)['items.0.price']);for(const n of [0,99999])assert.ok(!validate({...valid,items:[{name:'杯',price:n}]},1)['items.0.price']);assert.ok(validate({...valid,items:[{name:'',price:1}]},1)['items.0.name']);for(const items of [[],Array(4).fill({name:'杯',price:1})])assert.ok(validate({...valid,items},1).items);});
test('類別、顏色、email、街道與同意',()=>{for(const [k,v] of [['category','x'],['color','#fff'],['email','x'],['street','x'],['own',false],['consent',false],['shopUrl','http://example.invalid']])assert.ok(validate({...valid,[k]:v},1)[k]);});
test('攤位分配：首空位、換街與全滿',()=>{assert.deepEqual(allocateSlot('ki-lung',[]),{street:'ki-lung',slot:0});assert.deepEqual(allocateSlot('ki-lung',[{street:'ki-lung',slot:0}]),{street:'ki-lung',slot:1});const first=Array.from({length:12},(_,slot)=>({street:'ki-lung',slot}));assert.deepEqual(allocateSlot('ki-lung',first),{street:'yu-chau',slot:0});assert.equal(allocateSlot('ki-lung',[...first,...first.map(s=>({...s,street:'yu-chau'}))]),null);assert.equal(allocateSlot('invalid',[]),null);});
const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const jwk=await crypto.subtle.exportKey('jwk',keys.publicKey);jwk.kid='test';const b64=x=>Buffer.from(x).toString('base64url');
async function jwt(p,alg='RS256'){const s=b64(JSON.stringify({alg,kid:'test'}))+'.'+b64(JSON.stringify(p));const sig=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(s));return s+'.'+b64(sig);}
const p={aud:['expected'],email:'admin@example.invalid',exp:Math.floor(Date.now()/1000)+300,iss:'https://team.invalid'};
for(const [name,token,aud,email,expected] of [
 ['合法簽章',await jwt(p),'expected',p.email,true],['假 token','fake.token.here','expected',p.email,false],['錯 aud',await jwt(p),'other',p.email,false],['錯 email',await jwt(p),'expected','wrong@example.invalid',false],['過期',await jwt({...p,exp:1}),'expected',p.email,false],['拒絕演算法替換',await jwt(p,'none'),'expected',p.email,false],['錯 issuer',await jwt({...p,iss:'https://evil.invalid'}),'expected',p.email,false]
]){assert.equal(await verifyJWT(token,aud,email,[jwk],'https://team.invalid'),expected);console.log('通過：JWT '+name);count++;}
test('照片拒絕偽裝檔頭與截斷檔案',()=>{assert.equal(webpSize(new Uint8Array(100)),null);assert.equal(webpSize(new TextEncoder().encode('RIFFxxxxWEBPVP8X')),null);});
console.log(`共 ${count} 項測試通過`);
