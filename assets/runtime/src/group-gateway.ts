import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { resolve } from 'node:path';
import { readEncryptedCredential } from './luckin-mcp';
import { AppError } from './store';
export type Brand='luckin'|'mcd';
export interface GroupGateway { call(name:string,args:Record<string,unknown>):Promise<any>; close():Promise<void> }
const config={luckin:{url:'https://gwmcp.lkcoffee.com/order/user/mcp',file:'luckin-token.dpapi',tools:['queryShopList','searchProductForMcp','queryProductDetailInfo','switchProduct','previewOrder','createOrder','queryOrderDetailInfo']},mcd:{url:'https://mcp.mcd.cn',file:'mcd-token.dpapi',tools:['query-nearby-stores','query-meals','query-meal-detail','calculate-price','create-order','query-order']}};
export class GroupRemote implements GroupGateway{
  private client?:Client;
  constructor(readonly brand:Brand){}
  async connection(){if(this.client)return this.client;const c=config[this.brand],token=await readEncryptedCredential(resolve(import.meta.dir,'../data',c.file)),client=new Client({name:'ocp-team-meal-manager',version:'0.1.0'});
    try{await client.connect(new StreamableHTTPClientTransport(new URL(c.url),{requestInit:{headers:{Authorization:`Bearer ${token}`}}}),{timeout:20000});this.client=client;return client;}catch{await client.close().catch(()=>{});throw new AppError('connection_failed','品牌 MCP 连接失败，请检查本机凭证和网络。',502);}}
  async tools(){return (await (await this.connection()).listTools()).tools;}
  async call(name:string,args:Record<string,unknown>){if(!config[this.brand].tools.includes(name))throw new AppError('tool_denied','团餐适配器没有开放这个工具。',403);let result;
    try{result=await (await this.connection()).callTool({name,arguments:args},{timeout:30000});}catch{throw new AppError('upstream_unknown','品牌请求未返回确定结果。',502);}
    if(result.isError)throw new AppError('upstream_error','品牌工具返回错误；这不等于某个商品售罄。',502);
    let value:any=result.structuredContent;if(!value){const b=result.content.find(c=>c.type==='text');if(b?.type==='text')try{value=JSON.parse(b.text);}catch{}}
    if(!value||typeof value!=='object')throw new AppError('upstream_format','品牌响应格式无法识别。',502);
    if(value.success===false||(value.code!==undefined&&value.code!==0&&value.code!=='0'&&value.code!==200&&value.code!=='200'))throw new AppError('business_error','品牌业务请求未成功；请重新核查商品或门店。',502);
    return value.data??value;
  }
  async close(){await this.client?.close();}
}
