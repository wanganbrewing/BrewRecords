/* Reference costing only: chronological moving average; no tax treatment. */
(function(root){
  'use strict';
  const METHOD='moving-average-v1';
  const round=x=>Math.round((x+Number.EPSILON)*100)/100;
  const qty=x=>Math.round(x*1000000)/1000000;
  const validDate=d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d;
  function monthEnd(month){
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||Number(month.slice(0,4))<2000)throw Error('対象月を2000年以降で指定してください。');
    const [y,m]=month.split('-').map(Number);
    return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
  }
  function previousMonth(today){
    if(!validDate(today))throw Error('日付が正しくありません。');
    const d=new Date(today+'T00:00:00Z');d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);
  }
  function calculate(items,cutoff){
    if(!validDate(cutoff))throw Error('集計日が正しくありません。');
    const uses=[];
    const rows=items.map(item=>{
      const events=[];let invalid=false;
      for(const [key,kind] of [['receipts',0],['consumptions',1],['adjustments',2]]){
        (item[key]||[]).forEach((e,index)=>{
          if(!validDate(e.date)){invalid=true;return;}
          if(e.date>cutoff)return;
          const amount=Number(e.amount);
          if(e.amount===''||e.amount==null||!Number.isFinite(amount)||(kind<2&&amount<=0)){invalid=true;return;}
          events.push({...e,amount,kind,index});
        });
      }
      events.sort((a,b)=>a.date.localeCompare(b.date)||a.kind-b.kind||a.index-b.index);
      let stock=0,value=0,reason='';
      for(const e of events){
        if(e.kind===0){
          const price=e.price==null||String(e.price).trim()===''?NaN:Number(e.price);
          if(!Number.isFinite(price)||price<0){value=null;reason='入荷金額が未入力・不正';}
          else if(value!==null&&stock>=0)value+=price;
          else {value=null;reason=reason||'単価不明の在庫が含まれます';}
          stock=qty(stock+e.amount);
        }else{
          const delta=e.kind===1?-e.amount:e.amount;
          const unit=stock>0&&value!==null?value/stock:null;
          const insufficient=stock+delta< -0.000001;
          const cost=unit!==null&&!insufficient?unit*e.amount:null;
          if(e.kind===1)uses.push({itemId:item.id,name:item.name,manufacturer:item.manufacturer||'',lotCode:item.lotCode||'',unit:item.unit,batchId:e.batchId||'',date:e.date,amount:e.amount,value:invalid?null:cost,reason:invalid?'日付・数量に不正な履歴':insufficient?'消費時点で在庫不足':unit===null?(reason||'入荷単価が不明'):''});
          if(unit===null||insufficient){value=null;reason=insufficient?'履歴上の在庫不足':(reason||'単価不明の棚卸増減');}
          else value+=unit*delta;
          stock=qty(stock+delta);
        }
        if(stock===0){value=0;reason='';}
      }
      if(invalid){value=null;reason='日付・数量に不正な履歴（数量も要確認）';}
      if(stock<0){value=null;reason='在庫がマイナス';}
      if(value!==null&&!Number.isFinite(value)){value=null;reason='金額が計算範囲外';}
      return {itemId:item.id,name:item.name,category:item.category,manufacturer:item.manufacturer||'',lotCode:item.lotCode||'',unit:item.unit,quantity:stock,unitCost:stock>0&&value!==null?value/stock:null,value:value===null?null:round(value),reason};
    });
    return {method:METHOD,cutoff,rows,uses,subtotal:round(rows.reduce((s,r)=>s+(r.value??0),0)),unknown:rows.filter(r=>r.value===null).length};
  }
  function batchCost(batch,calculation,unlinked=[]){
    const uses=calculation.uses.filter(r=>r.batchId===batch.id);
    const missing=[...unlinked];
    const required=[...(batch.fermentables||[]),...(batch.hops||[]),...(batch.adjuncts||[])];
    if(batch.yeast)required.push({invId:batch.yeastInvId,amount:batch.yeastAmount,name:batch.yeast});
    const totals=new Map();
    required.forEach(r=>{if(r.invId)totals.set(r.invId,(totals.get(r.invId)||0)+Number(r.amount||0));else missing.push(r.name||'未連携の原材料');});
    for(const [id,amount] of totals){
      const actual=uses.filter(u=>u.itemId===id).reduce((s,u)=>s+u.amount,0);
      if(!Number.isFinite(amount)||amount<=0||Math.abs(actual-amount)>0.000001)missing.push('レシピ数量と消費記録が未一致');
    }
    if(uses.some(r=>!totals.has(r.itemId)))missing.push('レシピにない消費記録があります');
    const unknown=uses.filter(r=>r.value===null).length;
    return {uses,subtotal:round(uses.reduce((s,r)=>s+(r.value??0),0)),complete:uses.length>0&&unknown===0&&missing.length===0,unknown,missing:[...new Set(missing)]};
  }
  function normalizeBook(book){
    if(book==null)return {reports:[],autoEnabled:false,startMonth:''};
    if(!book||!Array.isArray(book.reports)||book.reports.some(r=>!r||typeof r.id!=='string'||!Array.isArray(r.rows)||r.rows.some(row=>!row||typeof row!=='object')||typeof r.month!=='string'||!validDate(r.cutoff)))throw Error('月末保存データの形式が正しくありません。');
    return JSON.parse(JSON.stringify({reports:book.reports,autoEnabled:book.autoEnabled===true,startMonth:typeof book.startMonth==='string'?book.startMonth:''}));
  }
  function makeReport(items,month,today,id,createdAt,reason,automatic=false){
    const cutoff=monthEnd(month);
    if(cutoff>=today)throw Error('月末が過ぎた月だけ保存できます。当月は参考表示のみです。');
    const calc=calculate(items,cutoff);
    if(!calc.rows.length)throw Error('原材料が登録されていません。');
    if(!String(reason||'').trim())throw Error('保存理由を入力してください。');
    return {id,month,createdAt,reason:String(reason).trim(),automatic,method:METHOD,cutoff,rows:calc.rows,subtotal:calc.subtotal,unknown:calc.unknown};
  }
  function mergeArchive(local,remote){
    const current=normalizeBook(local),incoming=normalizeBook(remote);
    const ids=new Set(incoming.reports.map(r=>r.id));
    const missing=current.reports.filter(r=>!ids.has(r.id));
    // Reports are immutable archives, not live ingredient references. Older clients
    // omit this field; never let that silently erase reports on updated devices.
    const book=remote==null?current:{...incoming,reports:[...incoming.reports,...missing]};
    return {book,needsSave:missing.length>0||(remote==null&&current.autoEnabled)};
  }
  const api={METHOD,round,validDate,monthEnd,previousMonth,calculate,batchCost,normalizeBook,makeReport,mergeArchive};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.InventoryCosting=api;
})(typeof window==='object'?window:this);
