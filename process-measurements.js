(function(root){
  'use strict';
  const fields={gravity:{label:'比重（SG）',min:0.8,max:1.3,step:0.001,digits:3},ph:{label:'pH',min:0,max:14,step:0.01,digits:2},temperature:{label:'温度（℃）',min:-10,max:150,step:0.1,digits:1},volume:{label:'液量（L）',min:0,max:10000000,step:0.001,digits:3}};
  function normalize(row,today){
    if(!row||typeof row!=='object')throw Error('実測記録の形式が正しくありません。');
    const stage=String(row.stage||'').trim(),date=String(row.date||''),time=String(row.time||''),note=String(row.note||'').trim();
    if(!stage||stage.length>120)throw Error('工程名を120文字以内で入力してください。');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||date>today)throw Error('測定日は本日以前の有効な日付で入力してください。');
    if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('測定時刻を確認してください。');
    if(note.length>300)throw Error('メモは300文字以内にしてください。');
    const result={stage,date,time,note};let entered=false;
    for(const [key,config] of Object.entries(fields)){
      const raw=row[key];
      if(raw==null||String(raw).trim()===''){result[key]='';continue;}
      const value=Number(raw),scale=10**config.digits;
      if(!Number.isFinite(value)||value<config.min||value>config.max||Math.abs(value*scale-Math.round(value*scale))>0.00001)throw Error(`${config.label}は${config.min}〜${config.max}、小数第${config.digits}位までで入力してください。`);
      result[key]=value;entered=true;
    }
    if(!entered)throw Error('比重・pH・温度・液量のいずれかを入力してください。');
    return result;
  }
  function revise(batch,recordId,input,reason,today,id,recordedAt){
    const rows=batch.processMeasurements??[];
    if(!Array.isArray(rows)||rows.some(r=>!r||typeof r!=='object'||!r.id)||new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('保存済み実測記録の形式を確認してください。');
    const before=recordId?rows.find(r=>r.id===recordId):null;
    if(recordId&&!before)throw Error('訂正する実測記録が見つかりません。');
    if(!before&&rows.length>=1000)throw Error('実測記録は1仕込み1000件までです。');
    const clean=normalize(input,today),why=String(reason||'').trim();
    if(!why||why.length>300)throw Error('登録・訂正理由を300文字以内で入力してください。');
    const values=r=>Object.fromEntries(['stage','date','time','note',...Object.keys(fields)].map(k=>[k,r[k]??'']));
    if(before&&JSON.stringify(values(before))===JSON.stringify(clean))throw Error('変更がありません。');
    if(before?.history!=null&&!Array.isArray(before.history))throw Error('訂正履歴の形式を確認してください。');
    const next={...clean,id:before?.id||id,history:[...(before?.history||[]),{recordedAt,reason:why,before:before?values(before):null,after:{...clean}}]};
    return {...batch,processMeasurements:before?rows.map(r=>r.id===recordId?next:r):[...rows,next]};
  }
  const api={fields,normalize,revise};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProcessMeasurements=api;
})(typeof window==='object'?window:this);
