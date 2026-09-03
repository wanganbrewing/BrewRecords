(function(root){
  'use strict';
  const categories={cleaning:'洗浄剤',sanitizer:'殺菌剤',boiler:'ボイラー薬剤',co2:'炭酸ガス',water:'水道',electricity:'電気',fuel:'燃料・ガス',packaging:'包装・容器',labor:'人件費',waterTreatment:'水質添加剤',other:'その他'};
  const round=x=>Math.round((x+Number.EPSILON)*100)/100;
  function decimal(value,max,label,blank){
    if(value==null||String(value).trim()===''){if(blank)return '';throw Error(`${label}を入力してください。`);}
    const n=Number(value);
    if(!Number.isFinite(n)||n<0||n>max||Math.abs(n*100-Math.round(n*100))>0.00001)throw Error(`${label}は0〜${max}、小数第2位までで入力してください。`);
    return n;
  }
  function normalizeRow(row,today){
    if(!row||typeof row!=='object')throw Error('費用の形式が正しくありません。');
    const name=String(row.name||'').trim(),category=String(row.category||'');
    if(!categories[category])throw Error('費用の分類を選択してください。');
    if(!name||name.length>120)throw Error('内容を120文字以内で入力してください。');
    const date=String(row.date||'');
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>today))throw Error('日付は本日以前の有効な日付にしてください（空欄も可）。');
    let amount=decimal(row.amount,1e9,'元の金額',true),percent=decimal(row.percent,100,'割り当てる割合',false),pricing;
    if(row.pricing){
      const p=row.pricing,rate=Number(p.rate),quantity=p.quantity==null||String(p.quantity).trim()===''?'':Number(p.quantity);
      if(!p.catalogId||!['mL','L','g','kg','個','回（1仕込み）'].includes(p.unit)||p.rate==null||String(p.rate).trim()===''||!Number.isFinite(rate)||rate<0||rate>1e9||Math.abs(rate*10000-Math.round(rate*10000))>0.0001)throw Error('保存された参考単価を確認してください。');
      if(quantity!==''&&(!Number.isFinite(quantity)||quantity<0||quantity>1e9||Math.abs(quantity*10000-Math.round(quantity*10000))>0.0001))throw Error('使用量は0〜10億、小数第4位までで入力してください。');
      if(quantity!==''&&rate*quantity>1e9)throw Error('1行の参考費用は10億円以下にしてください。');
      pricing={catalogId:String(p.catalogId),revision:p.revision,unit:p.unit,rate,quantity};amount=quantity===''?'':round(rate*quantity);percent=100;
    }
    const reference=String(row.reference||'').trim(),note=String(row.note||'').trim();
    if(reference.length>120||note.length>300)throw Error('伝票番号は120文字、メモは300文字以内で入力してください。');
    return {id:String(row.id||''),category,name,date,amount,percent,reference,note,...(pricing?{pricing}:{})};
  }
  function summarize(rows,today){
    if(rows==null)rows=[];
    if(!Array.isArray(rows))return {rows:[],subtotal:0,unknown:1,error:'保存された費用の形式を確認してください。'};
    const results=rows.map(row=>{
      try{const clean=normalizeRow(row,today);return {...clean,value:clean.amount===''?null:round(clean.amount*clean.percent/100),reason:clean.amount===''?'元の金額が未入力':''};}
      catch(error){return {...(row&&typeof row==='object'?row:{}),value:null,reason:error.message};}
    });
    return {rows:results,subtotal:round(results.reduce((s,r)=>s+(r.value??0),0)),unknown:results.filter(r=>r.value===null).length,error:''};
  }
  function combined(batch,material,today){
    const extra=summarize(batch.otherCosts,today);
    const complete=material.complete&&extra.unknown===0&&batch.otherCostsReviewed===true;
    const total=round(material.subtotal+extra.subtotal),liters=Number(batch.batchSize);
    return {extra,total,complete,perLiter:complete&&Number.isFinite(liters)&&liters>0?round(total/liters):null,liters};
  }
  function revision(batch,rows,reviewed,reason,today,id,recordedAt){
    if(!Array.isArray(rows)||rows.length>100)throw Error('費用は100行以内で登録してください。');
    if(batch.otherCosts!=null&&!Array.isArray(batch.otherCosts))throw Error('保存済みの費用形式が不正です。バックアップを確認してください。');
    const clean=rows.map(row=>normalizeRow(row,today));
    const ids=new Set();for(const r of clean){if(!r.id||ids.has(r.id))throw Error('費用のIDが重複しています。画面を開き直してください。');ids.add(r.id);}
    const sources=new Set();for(const row of clean){if(row.pricing){if(sources.has(row.pricing.catalogId))throw Error('同じ消耗品が重複しています。使用量を1行にまとめてください。');sources.add(row.pricing.catalogId);}}
    const why=String(reason||'').trim();if(!why||why.length>300)throw Error('保存・訂正理由を300文字以内で入力してください。');
    if(reviewed&&summarize(clean,today).unknown)throw Error('金額未入力の費用があります。入力完了にはできません。');
    const before={rows:JSON.parse(JSON.stringify(batch.otherCosts||[])),reviewed:batch.otherCostsReviewed===true};
    const after={rows:clean,reviewed:reviewed===true};
    if(JSON.stringify(before)===JSON.stringify(after))throw Error('変更がありません。');
    return {...batch,otherCosts:clean,otherCostsReviewed:after.reviewed,otherCostHistory:[...(batch.otherCostHistory||[]),{id,recordedAt,reason:why,before,after}]};
  }
  const api={categories,round,normalizeRow,summarize,combined,revision};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.BatchExpenses=api;
})(typeof window==='object'?window:this);
