// Isolated browser acceptance harness. Never creates a live gateway or reads credentials.
import { GroupStore } from './group-store';import { GroupFixture } from './group-fixture';import { GroupProvider } from './group-provider';import { GroupManager } from './group-manager';import { LocationService } from './location';import { locationSession } from './location-session';
const store=new GroupStore(':memory:');const gateway=new GroupFixture('luckin');const original=gateway.call.bind(gateway);
gateway.call=async(name,args)=>name==='queryShopList'?Array.from({length:8},(_,i)=>({deptId:123+i,deptName:'模拟门店'+(i+1),address:'模拟地址'+(i+1),workStatus:'模拟营业中',longitude:120+i*.002,latitude:30})):original(name,args);
const mapFetch=(async(url:any)=>String(url).includes('convert')?Response.json({status:'1',locations:'120,30'}):Response.json({status:'1',regeocode:{formatted_address:'模拟杭州市实验室',addressComponent:{city:'杭州市',township:'模拟街道'},pois:[{name:'模拟实验室'}]}})) as typeof fetch;
const manager=new GroupManager(store,new GroupProvider('luckin',gateway));const task=store.create({team:'浏览器隔离验收',title:'模拟选店',brand:'luckin',mode:'fixture',budget_cents:6000,payer:'模拟付款人',members:[{id:'p1',name:'模拟成员'}]});
const session=await locationSession(manager,task.id,new LocationService('DUMMY-KEY',mapFetch));console.log(JSON.stringify({url:session.url,mode:'fixture'}));
try{console.log(JSON.stringify(await session.finished));console.log(JSON.stringify({real_orders:0,create_calls:gateway.calls.filter(c=>c.name==='createOrder').length}));}finally{session.close();await gateway.close();store.close();}
