import { resolve } from 'node:path';
import { z } from 'zod';
import { GroupManager } from './group-manager';
import { LocationService,Places,amapLink,distanceMeters,Point } from './location';
import { AppError } from './store';
import { errorResponse } from './catalog';
export async function locationSession(manager:GroupManager,id:string,maps?:LocationService){
  maps??=await LocationService.configured();
  const initial=manager.task(id);manager.store.editable(initial);const places=new Places(manager.store),token=crypto.randomUUID();let base='',active=true,busy=false;
  let current:{point?:Point;city:string;keyword:string;address:string}|undefined;let shops:any[]=[];
  let finish!:(v:any)=>void;const finished=new Promise<any>(r=>finish=r);
  const done=(result:any)=>{if(!active)return;active=false;setTimeout(()=>{finish(result);server.stop(true);},250);};
  const timer=setTimeout(()=>done({task_id:id,state:'location_timeout',message:'定位会话已过期，任务未下单。'}),10*60*1000);
  const server=Bun.serve({hostname:'127.0.0.1',port:0,idleTimeout:120,async fetch(req){try{
    const url=new URL(req.url);if(req.headers.get('host')!==new URL(base).host)throw new AppError('bad_host','只允许本机访问',403);
    if(req.method==='GET'&&url.pathname==='/')return new Response(await Bun.file(resolve(import.meta.dir,'../public/location.html')).text(),{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
    if(req.headers.get('x-session-token')!==token)throw new AppError('session_required','定位会话授权无效',403);
    if(!active)throw new AppError('session_expired','定位会话已结束',410);
    if(req.method==='GET'&&url.pathname==='/api/state')return Response.json({task_id:id,brand:initial.brand,mode:initial.mode,places:places.list(),expires_in_seconds:600});
    if(req.method!=='POST'||req.headers.get('origin')!==base)throw new AppError('bad_origin','只允许本定位页操作',403);
    if(Number(req.headers.get('content-length')??0)>12000)throw new AppError('too_large','输入过长',413);
    if(busy)throw new AppError('busy','正在处理上一项操作，请稍候',409);busy=true;
    try{
      const body=await req.json();
      if(url.pathname==='/api/find'){
        shops=[];current=undefined;
        const args=z.object({kind:z.enum(['browser','saved','link','address','manual']),point:z.unknown().optional(),place_id:z.string().optional(),link:z.string().max(2000).optional(),address:z.string().max(300).optional(),city:z.string().max(100).optional(),keyword:z.string().max(100).optional()}).strict().parse(body);
        if(args.kind==='saved'){const p=places.list().find(p=>p.id===args.place_id);if(!p)throw new AppError('place_missing','常用地点不存在');current={point:{...p.point,source:'saved'},city:p.city,keyword:p.keyword,address:p.address};}
        else if(args.kind==='browser'){const p=await import('./location');const point=p.pointSchema.parse(args.point);if(point.source!=='browser'||point.coordinate_system!=='wgs84')throw new AppError('wrong_location_source','浏览器位置必须标记WGS84及browser来源');current=await maps.describe(point);}
        else if(args.kind==='address')current=await maps.address(args.address??'',args.city);
        else if(args.kind==='link'){const point=amapLink(args.link??'');try{current=await maps.describe(point);}catch(e){if(initial.brand==='luckin'&&(e as any).code==='map_key_required')current={point,city:'',keyword:'',address:'用户指定高德地图位置（未解析地址）'};else throw e;}}
        else {if(initial.brand!=='mcd'||!args.city?.trim()||!args.keyword?.trim())throw new AppError('manual_location','手动查麦当劳需要城市和地点关键词；瑞幸请使用地图链接。');current={city:args.city,keyword:args.keyword,address:args.city+' '+args.keyword};}
        const location=initial.brand==='luckin'?{longitude:current.point!.longitude,latitude:current.point!.latitude,...(args.keyword?{keyword:args.keyword}:{})}:{city:current.city,keyword:args.keyword||current.keyword};
        const result=await manager.shops(id,location);
        shops=result.shops.map(s=>{const r=s.raw??{};const lon=Number(r.longitude??r.storeLongitude),lat=Number(r.latitude??r.storeLatitude);const valid=Number.isFinite(lon)&&Number.isFinite(lat)&&Math.abs(lon)<=180&&Math.abs(lat)<=90;const meters=current?.point&&valid?distanceMeters(current.point,{longitude:lon,latitude:lat}):null;
          return {id:s.id,name:s.name,address:s.address,status:r.workStatus??r.businessStatus??r.statusName??'营业状态未提供',distance_m:meters,distance_basis:meters===null?'上游未提供可核实坐标':'同一查询坐标口径的直线估算，非步行距离',location};});
        shops.sort((a,b)=>(a.distance_m??Infinity)-(b.distance_m??Infinity));return Response.json({location:current,shops,mode:initial.mode,ordering:shops.some(s=>s.distance_m!==null)?'可计算距离的门店按直线距离排序；距离未知的排后':'上游返回顺序，无法保证最近排序'});
      }
      if(url.pathname==='/api/save'){
        const args=z.object({name:z.string().trim().min(1).max(60),user_confirmed:z.literal(true)}).strict().parse(body);if(!current?.point)throw new AppError('point_missing','此地点没有坐标，请先解析地图位置');
        const p=places.save({...current,keyword:current.keyword||args.name,name:args.name,user_confirmed:true});return Response.json({saved:{id:p.id,name:p.name},places:places.list()});
      }
      if(url.pathname==='/api/delete'){const args=z.object({place_id:z.string().uuid(),user_confirmed:z.literal(true)}).strict().parse(body);places.remove(args.place_id);return Response.json({places:places.list()});}
      if(url.pathname==='/api/select'){
        const args=z.object({shop_id:z.string(),user_confirmed:z.literal(true)}).strict().parse(body);const selected=shops.find(s=>s.id===args.shop_id);if(!selected)throw new AppError('store_missing','门店不在本次候选列表');
        const task=manager.task(id);if(task.revision!==initial.revision)throw new AppError('task_changed','任务已变化，请重新打开选店页');
        const next=await manager.selectShop(id,{expected_revision:task.revision,shop_id:selected.id,location:selected.location});const result={task_id:id,revision:next.revision,state:next.state,shop:{id:next.shop!.id,name:next.shop!.name,address:next.shop!.address},message:'已选择门店。返回 Agent 继续需求核对和报价；未下单。'};done(result);return Response.json(result);
      }
      if(url.pathname==='/api/cancel'){done({task_id:id,state:'location_cancelled',message:'已取消选店，未下单。'});return Response.json({cancelled:true});}
      throw new AppError('not_found','接口不存在',404);
    }finally{busy=false;}
  }catch(e){const response=errorResponse(e);response.headers.set('cache-control','no-store');return response;}}});base=server.url.origin;
  finished.finally(()=>clearTimeout(timer));return {url:base+'/#'+token,base,token,finished,close:()=>{clearTimeout(timer);done({task_id:id,state:'location_cancelled'});}};
}
