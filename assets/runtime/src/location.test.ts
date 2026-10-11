import { test,expect } from 'bun:test';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join,resolve,basename,sep } from 'node:path';
import { GroupStore } from './group-store';
import { GroupFixture } from './group-fixture';
import { GroupProvider } from './group-provider';
import { GroupManager } from './group-manager';
import { discoverStores } from './store-discovery';
import { LocationService,Places,amapLink,distanceMeters } from './location';
import { locationSession } from './location-session';
const point={longitude:120,latitude:30,coordinate_system:'gcj02' as const,source:'map_link' as const};
function setup(){const store=new GroupStore(':memory:'),gateway=new GroupFixture('luckin'),manager=new GroupManager(store,new GroupProvider('luckin',gateway));const task=store.create({team:'QA',title:'定位测试',brand:'luckin',mode:'fixture',budget_cents:6000,payer:'测试付款人',members:[{id:'p1',name:'测试成员'}]});return {store,gateway,manager,task};}
test('OCP store discovery paginates a complete snapshot and resolves store objects',async()=>{
 let calls=0;const provider={brand:'luckin',shops:async()=>{calls++;return Array.from({length:62},(_,i)=>({id:String(i),name:'模拟门店'+i,address:'模拟地址'}));}} as any;
 const c=await discoverStores(provider,{longitude:120,latitude:30});try{expect(c.shops).toHaveLength(62);expect(calls).toBe(1);expect((await c.resolve('61')).name).toBe('模拟门店61');await expect(c.resolve('missing')).rejects.toThrow();}finally{c.close();}
});
test('location source, accuracy and coordinate conversion are explicit; errors redact secrets',async()=>{
 let conversion=false;const request=(async(input:any)=>{const u=new URL(String(input));if(u.pathname.includes('convert')){expect(u.searchParams.get('coordsys')).toBe('gps');conversion=true;return Response.json({status:'1',locations:'120.004,30.003'});}expect(conversion).toBe(true);return Response.json({status:'1',regeocode:{formatted_address:'模拟杭州市实验室',addressComponent:{city:'杭州市',township:'模拟街道'},pois:[{name:'模拟实验室'}]}});}) as typeof fetch;
 const service=new LocationService('DUMMY-KEY',request);const d=await service.describe({...point,coordinate_system:'wgs84',source:'browser',accuracy_m:20});expect(d.point.coordinate_system).toBe('gcj02');expect(d.point.longitude).toBe(120.004);expect(d.city).toBe('杭州市');
 await expect(service.describe({...point,source:'browser',accuracy_m:2000})).rejects.toThrow('精度不足');await expect(new LocationService().describe(point)).rejects.toThrow('未配置');
 const failed=new LocationService('DUMMY-KEY',(async()=>{throw new Error('SECRET SHOULD NOT ESCAPE');}) as unknown as typeof fetch);await expect(failed.describe(point)).rejects.toThrow('地图解析未完成');
});
test('named locations need explicit consent and can be deleted',()=>{const s=new GroupStore(':memory:');try{const p=new Places(s);expect(()=>p.save({name:'实验室',point,city:'杭州',keyword:'实验室',address:'模拟',user_confirmed:false})).toThrow();const saved=p.save({name:'实验室',point,city:'杭州',keyword:'实验室',address:'模拟',user_confirmed:true});expect(p.list()[0].id).toBe(saved.id);p.remove(saved.id);expect(p.list()).toHaveLength(0);}finally{s.close();}});
test('map links are parsed locally and never fetched; unsupported links rejected',()=>{
 const p=amapLink('amap.com/?p=B0TEST,30.3,120.07,测试门店');expect(p.longitude).toBe(120.07);expect(p.latitude).toBe(30.3);expect(p.coordinate_system).toBe('gcj02');expect(()=>amapLink('https://evil.example/?p=x,30,120')).toThrow();expect(()=>amapLink('https://amap.com/short')).toThrow();expect(distanceMeters(point,point)).toBe(0);
});
test('browser session blocks CSRF, saves only on consent and selects through OCP without ordering',async()=>{
 const s=setup();const session=await locationSession(s.manager,s.task.id,new LocationService());const post=(path:string,body:any,origin=session.base,token=session.token)=>fetch(session.base+'/api/'+path,{method:'POST',headers:{origin,'x-session-token':token,'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  expect((await post('find',{kind:'link',link:'https://amap.com/?p=x,30,120'},'https://evil.example')).status).toBe(403);
  expect((await fetch(session.base+'/api/state')).status).toBe(403);
  const r=await post('find',{kind:'link',link:'https://amap.com/?p=x,30,120'});expect(r.status).toBe(200);const d=await r.json() as any;expect(d.shops[0].id).toBe('123');expect(d.shops[0].distance_m).toBeNull();expect(new Places(s.store).list()).toHaveLength(0);
  expect((await post('save',{name:'实验室',user_confirmed:false})).status).toBe(400);
  expect((await post('save',{name:'实验室',user_confirmed:true})).status).toBe(200);
  expect((await post('select',{shop_id:'not-returned',user_confirmed:true})).status).toBe(400);
  expect((await post('select',{shop_id:'123',user_confirmed:true})).status).toBe(200);const result=await session.finished;expect(result.shop.id).toBe('123');expect(s.store.get(s.task.id).shop?.id).toBe('123');expect(s.store.attempt(s.task.id)).toBeNull();expect(s.gateway.calls.some(c=>c.name==='createOrder')).toBe(false);
 }finally{session.close();await session.finished;await s.gateway.close();s.store.close();}
});
test('a changed task cannot silently switch stores from an old browser session',async()=>{
 const s=setup();const session=await locationSession(s.manager,s.task.id,new LocationService());const post=(path:string,body:any)=>fetch(session.base+'/api/'+path,{method:'POST',headers:{origin:session.base,'x-session-token':session.token,'content-type':'application/json'},body:JSON.stringify(body)});
 try{await post('find',{kind:'link',link:'https://amap.com/?p=x,30,120'});s.store.save(s.store.get(s.task.id));const r=await post('select',{shop_id:'123',user_confirmed:true});expect(r.status).toBe(400);expect(s.store.get(s.task.id).shop).toBeUndefined();}finally{session.close();await session.finished;await s.gateway.close();s.store.close();}
});
test('host-neutral CLI waits for browser selection and returns the selected task without ordering',async()=>{
 const dir=resolve(mkdtempSync(join(tmpdir(),'team-location-cli-'))),db=join(dir,'task.sqlite');const s=new GroupStore(db);const t=s.create({team:'CLI',title:'CLI选店',brand:'luckin',mode:'fixture',budget_cents:6000,payer:'模拟付款人',members:[{id:'p1',name:'模拟成员'}]});s.close();
 const child=Bun.spawn([process.execPath,resolve(import.meta.dir,'group-cli.ts'),'pick-store','--task',t.id,'--open','false'],{env:{...process.env,TEAM_MEAL_DB_PATH:db,AMAP_WEB_KEY:''},stdout:'pipe',stderr:'pipe'});
 try{const reader=child.stderr.getReader();const bytes=await reader.read();const first=new TextDecoder().decode(bytes.value).trim().split('\n')[0];const startup=JSON.parse(first);reader.releaseLock();const url=new URL(startup.location_url),token=url.hash.slice(1);const post=(route:string,body:any)=>fetch(url.origin+'/api/'+route,{method:'POST',headers:{origin:url.origin,'x-session-token':token,'content-type':'application/json'},body:JSON.stringify(body)});
 expect((await post('find',{kind:'link',link:'https://amap.com/?p=x,30,120'})).status).toBe(200);expect((await post('select',{shop_id:'123',user_confirmed:true})).status).toBe(200);
 const result=JSON.parse(await new Response(child.stdout).text());expect(await child.exited).toBe(0);expect(result.shop.id).toBe('123');const verify=new GroupStore(db);try{expect(verify.get(t.id).shop?.id).toBe('123');expect(verify.attempt(t.id)).toBeNull();}finally{verify.close();}
 }finally{if(child.exitCode===null)child.kill();await child.exited;if(!dir.startsWith(resolve(tmpdir())+sep)||!basename(dir).startsWith('team-location-cli-'))throw new Error('Unexpected temporary path');rmSync(dir,{recursive:true,force:true});}
});
