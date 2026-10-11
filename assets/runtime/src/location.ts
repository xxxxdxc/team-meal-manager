import { resolve } from 'node:path';
import { z } from 'zod';
import { GroupStore } from './group-store';
import { readEncryptedCredential } from './luckin-mcp';
import { AppError } from './store';
export const pointSchema=z.object({longitude:z.number().min(-180).max(180),latitude:z.number().min(-90).max(90),coordinate_system:z.enum(['wgs84','gcj02']),accuracy_m:z.number().nonnegative().optional(),source:z.enum(['browser','map_link','address','saved']),obtained_at:z.string().datetime().optional()}).strict();
export type Point=z.infer<typeof pointSchema>;
export interface Place {id:string;name:string;point:Point;city:string;keyword:string;address:string;created_at:string}
export class Places {
  constructor(readonly store:GroupStore){store.db.run('CREATE TABLE IF NOT EXISTS group_places (id TEXT PRIMARY KEY, data TEXT NOT NULL)');}
  list():Place[]{return (this.store.db.query('SELECT data FROM group_places ORDER BY rowid DESC').all() as {data:string}[]).map(r=>JSON.parse(r.data));}
  save(input:unknown){const args=z.object({name:z.string().trim().min(1).max(60),point:pointSchema,city:z.string().max(100),keyword:z.string().min(1).max(100),address:z.string().max(300),user_confirmed:z.literal(true)}).strict().parse(input);const p:Place={id:crypto.randomUUID(),name:args.name,point:args.point,city:args.city,keyword:args.keyword,address:args.address,created_at:new Date().toISOString()};this.store.db.run('INSERT INTO group_places VALUES (?,?)',[p.id,JSON.stringify(p)]);return p;}
  remove(id:string){if(!z.string().uuid().safeParse(id).success)throw new AppError('invalid_place','地点ID无效');this.store.db.run('DELETE FROM group_places WHERE id=?',[id]);}
}
type MapFetch=typeof fetch;
export class LocationService {
  constructor(private readonly key?:string,private readonly request:MapFetch=fetch){}
  static async configured(){const path=resolve(import.meta.dir,'../data/amap-key.dpapi');const key=process.env.AMAP_WEB_KEY??(await Bun.file(path).exists()?await readEncryptedCredential(path):undefined);return new LocationService(key);}
  async api(path:string,params:Record<string,string>){if(!this.key)throw new AppError('map_key_required','未配置高德 Web 服务 Key，请选择常用地点、地图链接或输入城市与地址。',503);let data:any;
    try{const u=new URL('https://restapi.amap.com'+path);u.search=new URLSearchParams({...params,key:this.key}).toString();const res=await this.request(u,{signal:AbortSignal.timeout(12000)});if(!res.ok)throw new Error();data=await res.json();}catch{throw new AppError('map_unavailable','地图解析未完成，请使用常用地点或手动位置。',502);}
    if(data.status!=='1')throw new AppError('map_failed','地图服务未能解析位置，请核查本机Key、额度或手动位置。',502);return data;
  }
  async describe(input:unknown){let point=pointSchema.parse(input);if(point.source==='browser'&&(point.accuracy_m===undefined||point.accuracy_m>1000))throw new AppError('location_inaccurate','当前位置精度不足（需1000米以内），请重试或选择常用地点／地图位置。');
    if(point.coordinate_system==='wgs84'){const d=await this.api('/v3/assistant/coordinate/convert',{locations:`${point.longitude},${point.latitude}`,coordsys:'gps'});if(!/^[-\d.]+,[-\d.]+$/.test(String(d.locations)))throw new AppError('coordinate_unknown','地图坐标转换结果不可识别');const [longitude,latitude]=String(d.locations).split(',').map(Number);point=pointSchema.parse({...point,longitude,latitude,coordinate_system:'gcj02'});}
    const d=await this.api('/v3/geocode/regeo',{location:`${point.longitude},${point.latitude}`,extensions:'all',radius:'1000'});const r=d.regeocode;const city=Array.isArray(r?.addressComponent?.city)?r.addressComponent.province:r?.addressComponent?.city;const poi=r?.pois?.[0]?.name;const keyword=poi||r?.addressComponent?.township||r?.formatted_address;
    if(typeof city!=='string'||!city||typeof keyword!=='string'||!keyword)throw new AppError('address_unknown','无法确定城市与地点，请手动输入');return {point,city,keyword:String(keyword).slice(0,100),address:String(r.formatted_address??'').slice(0,300)};
  }
  async address(address:string,city?:string){const d=await this.api('/v3/geocode/geo',{address,...(city?{city}:{})});if(!Array.isArray(d.geocodes)||d.geocodes.length!==1)throw new AppError('address_ambiguous','地址未唯一匹配，请补全城市、区和具体地址，或提供地图链接。');const [longitude,latitude]=String(d.geocodes[0].location).split(',').map(Number);return this.describe({longitude,latitude,coordinate_system:'gcj02',source:'address'});}
}
export function amapLink(value:string):Point{
  const u=new URL(value.includes('://')?value:'https://'+value);if(!/(^|\.)amap\.com$/.test(u.hostname))throw new AppError('map_link_unsupported','目前支持含经纬度的高德分享链接；短链接请展开后粘贴。');
  const p=u.searchParams.get('p')?.split(',');const explicit=u.searchParams.get('position')?.split(',');const latitude=Number(p?.[1]??explicit?.[1]);const longitude=Number(p?.[2]??explicit?.[0]);if(!p&&!explicit)throw new AppError('map_link_unsupported','链接没有可解析经纬度，请展开或输入地址。');return pointSchema.parse({longitude,latitude,coordinate_system:'gcj02',source:'map_link'});
}
export function distanceMeters(a:{longitude:number;latitude:number},b:{longitude:number;latitude:number}){const rad=Math.PI/180;const dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad;const h=Math.sin(dLat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dLon/2)**2;return Math.round(6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h)));}
