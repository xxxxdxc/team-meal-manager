import { createHash } from 'node:crypto';
import { AppError } from './store';
import { type Brand,type GroupGateway } from './group-gateway';
import { type Line,type Shop,type MenuProduct,type PreparedLine,type BasketPreview,type Selection } from './group-types';
const digest=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function yuanCents(v:any){const n=typeof v==='string'&&v.trim()?Number(v):v;if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new AppError('price_missing','上游没有有效金额。',502);return Math.round(n*100);}
function integerCents(v:any){if(typeof v!=='number'||!Number.isSafeInteger(v)||v<0)throw new AppError('price_missing','麦当劳没有有效的分单位金额。',502);return v;}
const https=(v:any)=>{if(typeof v!=='string')return undefined;try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password?v:undefined;}catch{return undefined;}};
function requireLuckinProduct(p:any){if(!p||!Number.isSafeInteger(p.productId)||typeof p.skuCode!=='string'||!p.skuCode)throw new AppError('invalid_product','瑞幸商品缺少有效 SKU。',502);return p;}

// Index-based choices avoid ambiguous repeated codes such as the MCD ice group.
export function mcdModifications(mod:any,choices:Selection['mcd_choices']){
  const groups=mod?.items??[],values:any[]=[],labels:string[]=[];if(!Array.isArray(groups))throw new AppError('detail_changed','麦当劳特制结构不可识别。',502);
  const seen=new Set<string>();for(const c of choices){if(!groups[c.group]?.values?.[c.value])throw new AppError('invalid_option','特制选项不存在。');const id=c.group+':'+c.value;if(seen.has(id))throw new AppError('duplicate_option','特制选项重复。');seen.add(id);}
  groups.forEach((g:any,group:number)=>{if(!Array.isArray(g.values))throw new AppError('detail_changed','特制组结构异常。',502);const explicit=choices.filter(c=>c.group===group);let count=0;
    g.values.forEach((v:any,value:number)=>{const q=explicit.length?(explicit.find(c=>c.value===value)?.quantity??0):Number(v.selectedQuantity??0);if(!Number.isInteger(q)||q<0||(v.maxQuantity>=0&&q>v.maxQuantity)||(q>0&&q<Number(v.minQuantity??0)))throw new AppError('invalid_option','特制数量不符合商品限制。');
      count+=q;const key=q>0?v.selectedKey:v.unselectedKey;if(key!==undefined&&key!==null&&key!==''){values.push({code:String(v.code),key:String(key),quantity:q});if(q>0)labels.push(v.name);}});
    if(count<Number(g.minValues??0)||(g.maxValues>=0&&count>g.maxValues))throw new AppError('invalid_option','特制组选择数量不符合限制。');});
  return {modification:values.length?{values}:undefined,labels};
}
export class GroupProvider{
  constructor(readonly brand:Brand,readonly gateway:GroupGateway){}
  async shops(input:any):Promise<Shop[]>{
    if(this.brand==='luckin'){if(typeof input.longitude!=='number'||Math.abs(input.longitude)>180||typeof input.latitude!=='number'||Math.abs(input.latitude)>90)throw new AppError('location_required','瑞幸需要组织者指定的经纬度。');const list=await this.gateway.call('queryShopList',{longitude:input.longitude,latitude:input.latitude,...(input.keyword?{deptName:String(input.keyword)}:{})});if(!Array.isArray(list))throw new AppError('bad_stores','门店响应不是列表。',502);return list.map(s=>({id:String(s.deptId),name:s.deptName,address:s.address,location:{longitude:input.longitude,latitude:input.latitude},raw:s}));}
    if(typeof input.city!=='string'||!input.city.trim()||typeof input.keyword!=='string'||!input.keyword.trim())throw new AppError('location_required','麦当劳需要组织者指定城市和地点关键词。');const list=await this.gateway.call('query-nearby-stores',{beType:1,searchType:2,city:input.city,keyword:input.keyword});if(!Array.isArray(list))throw new AppError('bad_stores','门店响应不是列表。',502);return list.map(s=>({id:String(s.storeCode),name:s.storeName,address:s.address,raw:s}));
  }
  async menu(shop:Shop,query:string):Promise<MenuProduct[]>{
    if(this.brand==='luckin'){const list=await this.gateway.call('searchProductForMcp',{deptId:Number(shop.id),query:query||'咖啡 奶茶 果茶'});if(!Array.isArray(list))throw new AppError('bad_menu','瑞幸菜单响应异常。',502);return list.map(v=>{const p=requireLuckinProduct(v);return {id:String(p.productId),title:p.productName,reference_cents:typeof p.estimatePrice==='number'?yuanCents(p.estimatePrice):null,raw:p};});}
    const data=await this.gateway.call('query-meals',{storeCode:shop.id,orderType:1,beType:1});if(!data.meals||typeof data.meals!=='object')throw new AppError('bad_menu','麦当劳菜单结构不可识别。',502);
    const categories=new Map<string,string>();for(const c of data.categories??[])for(const m of c.meals??[])categories.set(m.code,c.name);
    return Object.entries(data.meals).map(([id,raw]:[string,any])=>({id,title:raw.name,reference_cents:raw.currentPrice!==undefined?yuanCents(raw.currentPrice):null,category:categories.get(id),raw})).filter(p=>!query||`${p.title} ${p.category??''}`.includes(query));
  }
  async detail(shop:Shop,id:string){return this.brand==='luckin'?requireLuckinProduct(await this.gateway.call('queryProductDetailInfo',{deptId:Number(shop.id),productId:Number(id)})):this.gateway.call('query-meal-detail',{storeCode:shop.id,orderType:1,beType:1,code:id});}
  async prepare(shop:Shop,line:Line,menu:MenuProduct[]):Promise<PreparedLine>{
    const ref=menu.find(p=>p.id===line.product_id);if(!ref)throw new AppError('product_not_queried','请先通过 OCP 查询该商品，再配餐。');let d=await this.detail(shop,line.product_id),item:any,specs:string[]=[];
    if(this.brand==='luckin'){
      if(line.selection.mcd_choices.length||line.selection.mcd_rounds.length)throw new AppError('wrong_brand_options','瑞幸不能使用麦当劳规格。');
      for(const a of line.selection.luckin_attributes){const g=d.productAttrs?.find((g:any)=>g.attributeId===a.group),v=g?.productSubAttrs?.find((v:any)=>v.attributeId===a.value);if(!v||v.canSelected===0)throw new AppError('invalid_option','瑞幸规格不可选；请只重配受影响的人。');d=requireLuckinProduct(await this.gateway.call('switchProduct',{deptId:Number(shop.id),productId:d.productId,skuCode:d.skuCode,amount:line.quantity,attrOperationParam:{attributeId:a.group,subAttr:{attributeId:a.value,operation:3}}}));}
      for(const a of line.selection.luckin_attributes)if(!d.productAttrs?.find((g:any)=>g.attributeId===a.group)?.productSubAttrs?.some((v:any)=>v.attributeId===a.value&&v.selected===true))throw new AppError('options_changed','规格组合发生变化，不能静默下单。');
      specs=d.productAttrs?.flatMap((g:any)=>g.productSubAttrs?.filter((v:any)=>v.selected).map((v:any)=>v.attributeName)??[])??[];item={productId:d.productId,skuCode:d.skuCode,amount:line.quantity};
    }else{
      if(line.selection.luckin_attributes.length)throw new AppError('wrong_brand_options','麦当劳不能使用瑞幸规格。');
      const modification=mcdModifications(d.modification,line.selection.mcd_choices);specs=modification.labels;item={productCode:String(d.code),quantity:line.quantity,...(modification.modification?{modification:modification.modification}:{})};
      if(line.selection.mcd_rounds.some(r=>!d.rounds?.some((v:any)=>String(v.id)===r.round)))throw new AppError('invalid_round','套餐轮次不可识别。');
      const roundList=[];for(const round of d.rounds??[]){if(!Array.isArray(round.choices))throw new AppError('detail_changed','套餐结构不可识别，需组织者确认。');const explicit=line.selection.mcd_rounds.find(r=>r.round===String(round.id));const chosen=explicit?.choices??round.choices.filter((c:any)=>c.isDefault===1).map((c:any)=>({code:String(c.code),quantity:Number(c.quantity??1),modifications:[]}));let count=0;const comboItemList=[];
        for(const c of chosen){const value=round.choices.find((v:any)=>String(v.code)===c.code);if(!value||!Number.isInteger(c.quantity)||c.quantity<1||(value.maxQuantity>=0&&c.quantity>value.maxQuantity))throw new AppError('invalid_round','套餐子项不符合门店限制。');count+=c.quantity;const m=mcdModifications(value.modification,c.modifications);comboItemList.push({code:c.code,quantity:c.quantity,...(m.modification?{modification:m.modification}:{})});specs.push(value.name,...m.labels);}
        if(count<Number(round.minQuantity??round.quantity??1)||(round.maxQuantity>=0&&count>round.maxQuantity))throw new AppError('invalid_round','套餐子项数量不符合限制。');roundList.push({round:String(round.id),comboItemList});}
      if(roundList.length)item.roundList=roundList;
    }
    return {member_id:line.member_id,product_id:line.product_id,title:d.productName??d.name??ref.title,quantity:line.quantity,specification:specs.join(' / ')||'商品默认规格',reference_cents:ref.reference_cents,item,selection:line.selection,hard_checks:line.hard_checks,reason:line.reason};
  }
  aggregate(lines:PreparedLine[]){const map=new Map<string,any>();for(const l of lines){const item=structuredClone(l.item),quantity=this.brand==='luckin'?'amount':'quantity',n=item[quantity];delete item[quantity];const key=JSON.stringify(item);const prior=map.get(key);if(prior)prior[quantity]+=n;else map.set(key,{...item,[quantity]:n});}return [...map.values()];}
  async preview(shop:Shop,lines:PreparedLine[],takeWayCode?:string):Promise<BasketPreview>{
    const items=this.aggregate(lines);if(this.brand==='luckin'){const d=await this.gateway.call('previewOrder',{deptId:Number(shop.id),productList:items}),total=yuanCents(d.discountPrice),coupons=d.couponCodeList??[];if(!Array.isArray(coupons)||coupons.some(c=>typeof c!=='string'))throw new AppError('bad_coupon','瑞幸优惠返回异常。',502);if(!shop.location)throw new AppError('location_missing','缺少瑞幸查询地点。');const payload={deptId:Number(shop.id),productList:items,...shop.location,couponCodeList:coupons};return {total_cents:total,fingerprint:digest({total,items,coupons}),payload,line_prices:d.productInfoList};}
    const d=await this.gateway.call('calculate-price',{storeCode:shop.id,beType:1,orderType:1,items,needTableware:false}),total=integerCents(d.price),ways=d.takeWayList??[];
    // Match official semantic code observed in live data; never fall back to dine-in or guess a code.
    if(!Array.isArray(ways))throw new AppError('pickup_required','取餐方式响应不可识别。');const pickup=takeWayCode?ways.find((w:any)=>w.code===takeWayCode):ways.find((w:any)=>w.code==='take-in-store');if(!pickup||pickup.code==='eat-in'||/堂食|得来速/.test(pickup.title??'')||(pickup.code!=='take-in-store'&&!/外带|自提|自取|取餐柜/.test(pickup.title??'')))throw new AppError('pickup_required','计价结果未提供已选自取方式，请明确选择 takeWayList 中的自取方式。');
    const payload={storeCode:shop.id,beType:1,orderType:1,items,needTableware:false,takeWayCode:pickup.code};return {total_cents:total,fingerprint:digest({total,items,priceRows:d.productList,pickup:pickup.code}),payload,pickup_options:ways,line_prices:d.productList};
  }
  async create(preview:BasketPreview){const d=await this.gateway.call(this.brand==='luckin'?'createOrder':'create-order',preview.payload);const id=typeof d.orderIdStr==='string'?d.orderIdStr:typeof d.orderId==='string'?d.orderId:Number.isSafeInteger(d.orderId)?String(d.orderId):undefined;if(!id)throw new AppError('order_unknown','品牌订单 ID 不可识别，请在官方 App 核对。',502);
    if(this.brand==='luckin')return {order_id:id,brand:this.brand,need_pay:d.needPay,pay_url:typeof d.payOrderUrl==='string'&&d.payOrderUrl.startsWith('weixin://')?d.payOrderUrl:https(d.payOrderUrl),pay_qr_url:https(d.payOrderQrCodeUrl),status:'已创建，待查询真实状态'};
    return {order_id:id,brand:this.brand,pay_url:https(d.payH5Url),status:d.orderDetail?.orderStatus??'已创建，待查询真实状态'};
  }
  async status(id:string){const d=await this.gateway.call(this.brand==='luckin'?'queryOrderDetailInfo':'query-order',{orderId:id});if(this.brand==='luckin')return {order_id:id,status:d.orderStatusName??({10:'待付款',20:'下单成功',30:'制作中',60:'等待取餐',80:'已完成',100:'已取消'} as Record<number,string>)[d.orderStatus]??'未知状态',pickup_code:d.takeMealCodeInfo?.code??''};return {order_id:id,status:d.orderStatus??'未知状态',pickup_code:d.pickupCode??'',locker_code:d.lockerCode??''};}
}
