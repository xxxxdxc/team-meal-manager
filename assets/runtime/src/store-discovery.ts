import { OcpClient } from '@ocp-catalog/ocp-client';
import { catalogManifestSchema, catalogQueryRequestSchema, resolveRequestSchema } from '@ocp-catalog/ocp-schema';
import { validateCatalogQueryRequest } from '@ocp-catalog/ocp-client';
import { GroupProvider } from './group-provider';
import { Shop } from './group-types';
import { AppError } from './store';
import { errorResponse } from './catalog';

// MCP is confined to GroupProvider/GroupGateway. Clients discover stores via OCP.
export async function discoverStores(provider: GroupProvider, location: Record<string, unknown>) {
  let base = ''; const catalogId = `team-stores-${provider.brand}`; const found = new Map<string, Shop>();let snapshot:Shop[]|undefined;
  const manifest = () => catalogManifestSchema.parse({
    ocp_version:'1.0', kind:'CatalogManifest', id:'manifest-'+catalogId, catalog_id:catalogId,
    catalog_name:'团餐门店目录', description:'品牌适配器映射的真实门店；位置来自用户授权。',
    endpoints:{query:{url:base+'/ocp/query',method:'POST'},resolve:{url:base+'/ocp/resolve',method:'POST'},health:{url:base+'/ocp/health',method:'GET'},contracts:{url:base+'/ocp/contracts',method:'GET'}},
    query_capabilities:[{capability_id:'team.stores',query_packs:[{pack_id:'team.store.location.v1',query_modes:['filter']}],supports_resolve:true,supports_explain:true}],object_contracts:[]
  });
  const server=Bun.serve({hostname:'127.0.0.1',port:0,async fetch(req){try{
    const path=new URL(req.url).pathname;
    if(req.method==='GET'&&path==='/ocp/manifest')return Response.json(manifest());
    if(req.method==='POST'&&path==='/ocp/query'){
      const args=catalogQueryRequestSchema.parse(await req.json());
      if(args.catalog_id&&args.catalog_id!==catalogId)throw new AppError('wrong_catalog','目录不匹配');
      if(args.offset!==0||Object.keys(args.filters).length||args.query)throw new AppError('unsupported_query','门店目录绑定本次确认位置，不支持额外筛选');
      if(args.cursor&&!/^next:[0-9]+$/.test(args.cursor))throw new AppError('invalid_cursor','翻页标记无效');
      const policy=validateCatalogQueryRequest(manifest(),args).policy_summary;
      snapshot??=await provider.shops(location);snapshot.forEach(s=>found.set(s.id,s));const start=args.cursor?Number(args.cursor.slice(5)):0;const shops=snapshot.slice(start,start+args.limit);const more=start+shops.length<snapshot.length;
      // No silent truncation: select nearest only after the complete upstream result arrives.
      return Response.json({ocp_version:'1.0',kind:'CatalogQueryResult',id:'qry_'+crypto.randomUUID(),catalog_id:catalogId,query_pack:policy.selected_query_pack,query_mode:policy.query_mode,query:args.query,result_count:shops.length,page:{limit:args.limit,offset:0,has_more:more,...(more?{next_cursor:'next:'+(start+shops.length)}:{})},policy_summary:policy,entries:shops.map(s=>({entry:{kind:'CatalogEntry',catalog_id:catalogId,entry_id:`store:${provider.brand}:${s.id}`,provider_id:s.id,object_id:s.id,object_type:'team.commerce.store',title:s.name,attributes:{shop:s}},score:1,explain:['门店来源为品牌适配器；用户必须选择。']}))});
    }
    if(req.method==='POST'&&path==='/ocp/resolve'){
      const args=resolveRequestSchema.parse(await req.json());const s=[...found.values()].find(s=>args.entry_id===`store:${provider.brand}:${s.id}`);
      if(!s)throw new AppError('store_missing','门店不在本次查询结果中',404);
      return Response.json({ocp_version:'1.0',kind:'ResolvableReference',id:'res_'+crypto.randomUUID(),catalog_id:catalogId,entry_id:args.entry_id,commercial_object_id:args.entry_id,object_id:s.id,object_type:'team.commerce.store',provider_id:s.id,title:s.name,visible_attributes:{shop:s},action_bindings:[],live_checks:[{check_id:'store_discovered',status:'passed',checked_at:new Date().toISOString(),summary:'本次品牌门店查询返回'}],freshness:{object_updated_at:new Date().toISOString(),resolved_at:new Date().toISOString()},expires_at:new Date(Date.now()+120000).toISOString()});
    }
    if(req.method==='GET'&&path==='/ocp/health')return Response.json({ocp_version:'1.0',kind:'CatalogHealth',catalog_id:catalogId,status:'healthy',ready:true,checked_at:new Date().toISOString()});
    if(req.method==='GET'&&path==='/ocp/contracts')return Response.json({ocp_version:'1.0',kind:'ObjectContractList',catalog_id:catalogId,object_contracts:[]});
    throw new AppError('not_found','接口不存在',404);
  }catch(e){return errorResponse(e);}}});base=server.url.origin;
  try{
    const client=new OcpClient({timeoutMs:60000});await client.inspectCatalog(base+'/ocp/manifest');
    let cursor:string|undefined;const entries:any[]=[];
    do{const result=await client.queryCatalog(base+'/ocp/query',{query:'',query_pack:'team.store.location.v1',query_mode:'filter',filters:{},limit:50,offset:0,explain:true,...(cursor?{cursor}:{})});entries.push(...result.entries);cursor=result.page.next_cursor;}while(cursor);
    const shops=entries.map(e=>e.entry.attributes.shop as Shop);
    // Resolve all stores through the same OCP catalog, never jump back to MCP from UI.
    return {shops, resolve:async(id:string)=>{const r=await client.resolveCatalogEntry(base+'/ocp/resolve',{entry_id:`store:${provider.brand}:${id}`,purpose:'view',live_check:true,requested_fields:[]});return r.visible_attributes.shop as Shop;},close:()=>server.stop(true)};
  }catch(e){server.stop(true);throw e;}
}
