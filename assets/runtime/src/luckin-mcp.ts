import { Client,StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { resolve } from 'node:path';
import { AppError } from './store';

export const credentialPath=resolve(import.meta.dir,'../data/luckin-token.dpapi');
export interface LuckinGateway { call(name:string,args:Record<string,unknown>):Promise<any>; close():Promise<void> }
export async function readEncryptedCredential(path:string):Promise<string> {
  if(!await Bun.file(path).exists())throw new AppError('credential_missing','尚未配置本机加密凭证。',503);
  const script="Import-Module ($env:WINDIR+'\\System32\\WindowsPowerShell\\v1.0\\Modules\\Microsoft.PowerShell.Security') -ErrorAction Stop; $s=(Get-Content -Raw -LiteralPath $env:LUCKIN_CREDENTIAL_PATH).Trim() | ConvertTo-SecureString; $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p))} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p)}";
  const proc=Bun.spawn(['powershell.exe','-NoProfile','-NonInteractive','-Command',script],{env:{...process.env,PSModulePath:resolve(process.env.WINDIR??'C:/Windows','System32/WindowsPowerShell/v1.0/Modules'),LUCKIN_CREDENTIAL_PATH:path},stdout:'pipe',stderr:'pipe'});
  const token=await new Response(proc.stdout).text();
  if(await proc.exited!==0||!token.trim())throw new AppError('credential_unreadable','凭证解密失败，请使用保存凭证的 Windows 用户运行服务。',503);
  return token.trim();
}
export const readCredential=()=>readEncryptedCredential(credentialPath);
export class RemoteLuckin implements LuckinGateway {
  private client?:Client; private connecting?:Promise<Client>;
  async connect(){
    if(this.client)return this.client;
    if(this.connecting)return this.connecting;
    this.connecting=(async()=>{
      const token=await readCredential(),client=new Client({name:'ocp-luckin-adapter',version:'0.1.0'});
      const transport=new StreamableHTTPClientTransport(new URL('https://gwmcp.lkcoffee.com/order/user/mcp'),{requestInit:{headers:{Authorization:`Bearer ${token}`}}});
      try{await client.connect(transport,{timeout:20000});this.client=client;return client;}
      catch{await transport.close().catch(()=>{});throw new AppError('luckin_connection','无法连接瑞幸 MCP，请检查网络和凭证。',502);}
    })();
    try{return await this.connecting;}finally{this.connecting=undefined;}
  }
  async call(name:string,args:Record<string,unknown>){
    if(!['queryShopList','searchProductForMcp','queryProductDetailInfo','switchProduct','previewOrder','createOrder','queryOrderDetailInfo'].includes(name))throw new AppError('tool_denied','该工具未开放。',403);
    const client=await this.connect();let result;
    try{result=await client.callTool({name,arguments:args},{timeout:25000});}
    catch{throw new AppError('luckin_unavailable',name==='createOrder'?'下单结果未知，请先在瑞幸 App 检查订单，不要重复提交。':'瑞幸请求失败或超时，请稍后重试。',502);}
    // Never expose raw upstream messages: they may contain credentials, payment links or account data.
    if(result.isError)throw new AppError('luckin_tool_error',name==='createOrder'?'瑞幸返回下单错误，请检查瑞幸 App 后再操作。':'瑞幸暂时无法完成此请求。',502);
    let value:any=result.structuredContent;
    if(!value){const block=result.content.find(c=>c.type==='text');if(block?.type==='text')try{value=JSON.parse(block.text);}catch{}}
    if(!value||typeof value!=='object')throw new AppError('luckin_format','瑞幸返回格式无法识别。',502);
    if(value.success===false||(value.code!==undefined&&value.code!==0&&value.code!=='0'))throw new AppError('luckin_business_error','瑞幸业务请求未成功，请检查门店或账户状态。',502);
    return value.data??value;
  }
  async close(){await this.client?.close();}
}
