(function(root){
  'use strict';
  const clone=v=>JSON.parse(JSON.stringify(v));
  const text=v=>v==null?'':String(v);
  const numeric=(v,label,min=0,max=1e9)=>{
    const s=text(v).normalize('NFKC').trim();if(!s)return '';
    if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)||!Number.isFinite(Number(s))||Number(s)<min||Number(s)>max)throw Error(`${label}：${min}〜${max}の数値を入力してください。`);
    return String(Number(s));
  };
  const sum=(a,b)=>a===''&&b===''?'':String(Math.round(((Number(a)||0)+(Number(b)||0))*1e6)/1e6);
  const fields=[
    ['batchNumber','バッチ番号','text'],['tradeName','帳簿・取引先向け名称','text'],['productName','商品名','text'],['tank','使用予定タンク','text'],
    ['sanitizeDate','洗浄・殺菌の予定日','date'],['sanitizeBy','洗浄・殺菌の予定担当','text'],['millGap','ミルギャップ','number','mm'],
    ['mashWater1','糖化用水 Batch 1','number','L'],['mashWater2','糖化用水 Batch 2','number','L'],['spargeWater1','スパージ水 Batch 1','number','L'],['spargeWater2','スパージ水 Batch 2','number','L'],
    ['sulfateChlorideRatio','SO₄ / Cl 目標比','number',''],['residualAlkalinity','残留アルカリ度 目標','number','mg/L as CaCO₃',-1000,1000],
    ['yeastSource','酵母の由来（fresh pitch等）','text'],['yeastGeneration','酵母の世代','text'],['yeastHarvestDate','酵母回収予定日','date'],
    ['pitchRate','酵母投入率 目標','number',''],['pitchRateUnit','投入率の単位','text'],['cellDensity','細胞密度 目標','number','×10⁶ cells/mL'],
    ['targetFG','目標 FG','number','SG',1,1.3],['targetABV','目標 ABV','number','%',0,100],['targetIBU','目標 合計IBU','number','IBU'],
    ['targetLoss','目標 欠減量','number','L'],['targetCost','目標 原価/L','number','円/L'],['planNotes','仕込み計画メモ','text']
  ];
  // These are empty target templates, not a recipe or recommended operating values.
  const steps=[
    ['strike','仕込み水の加熱（Strike Water）','temp'],['mashIn','マッシュイン','time,temp,duration'],['mashVolume','糖化槽の液量','volume'],
    ['rest1','糖化休止 1','mashTemp,mashTime'],['rest2','糖化休止 2','temp,duration'],['rest3','糖化休止 3','temp,duration'],
    ['mashOut','マッシュアウト','time,temp,duration'],['iodine','ヨウ素反応確認','time,note'],['mashGravity','糖化中の比重・糖度','gravity'],['mashPh','糖化中のpH','ph'],
    ['lauterRest','ろ過前の静置（Lauter rest）','duration'],['grant','グラントへの充填','time,volume'],['recirculation','麦汁循環（LT）','duration'],
    ['flow','LT → KWT 移送流量','flow'],['kwtStart','煮沸釜（KWT）への充填開始','time'],['firstRun','初流麦汁（First Run）','gravity,ph'],
    ['spargeStart','スパージ開始時の釜内液量','volume'],['lastRun','終流麦汁（Last Run）','gravity,ph'],['kwtLevel','煮沸釜の充填液量','volume'],['kwtStop','煮沸釜への充填終了','time'],
    ['preBoil','煮沸前','gravity,ph'],['boil','煮沸','time,boilTime'],['hop1','ホップ投入 1','time,note'],['hop2','ホップ投入 2','time,note'],['hop3','ホップ投入 3','time,note'],['hop4','ホップ投入 4','time,note'],
    ['boilEnd','煮沸終了','time,gravity,ph,volume'],['dilution','希釈水の追加','volume'],['totalVolume','希釈後の合計液量','volume'],
    ['whirlpoolStart','ワールプール開始・運転','time,duration'],['whirlpoolEnd','ワールプール終了・静置','time,duration'],
    ['knockoutStart','冷却・発酵槽への移送開始','time'],['knockoutEnd','冷却・発酵槽への移送終了','time'],['knockoutTemp','移送麦汁の温度','temp'],
    ['aeration','酸素供給','pressure,duration,note'],['originalGravity','発酵前の比重・pH','targetOG,plato,ph'],
    ['yeastHydration','酵母の水和','temp,note'],['yeastVolume','液状酵母の投入液量','volume'],['fermenterVolume','発酵槽内の液量','volume'],
    ['fermenterSet','発酵槽の設定温度','temp'],['hltSet','温水タンク（HLT）の設定温度','temp']
  ];
  const metrics={time:['予定時刻','','time'],duration:['所要時間','分','number',0],temp:['目標温度','℃','number',-50,200],gravity:['目標比重・糖度','','number',0,100],ph:['目標pH','','number',0,14],volume:['目標液量','L','number',0],flow:['目標流量','L/分','number',0],pressure:['目標圧力','bar','number',0],plato:['目標糖度','°P','number',0,100],note:['条件・備考','','text'],mashTemp:['目標糖化温度','℃','bound'],mashTime:['目標糖化時間','分','bound'],boilTime:['目標煮沸時間','分','bound'],targetOG:['目標OG','SG','bound']};
  const rowTypes={fermentable:['fermentables','kg'],hop:['hops','g'],adjunct:['adjuncts','g'],mineral:['minerals','g']};
  function empty(){return {version:1,fields:{},steps:[]};}
  function normalize(plan){
    if(plan==null)return empty();
    if(plan.version!==1||!plan.fields||typeof plan.fields!=='object'||Array.isArray(plan.fields)||!Array.isArray(plan.steps))throw Error('目標仕込み表の形式を確認できません。更新版で開き直してください。');
    const result=clone(plan);if(result.steps.length>100)throw Error('目標工程は100行以内にしてください。');
    for(const f of fields){if(f[2]==='number')result.fields[f[0]]=numeric(result.fields[f[0]],f[1],f[4]??0,f[5]??1e9);else{result.fields[f[0]]=text(result.fields[f[0]]);if(result.fields[f[0]].length>1000)throw Error(`${f[1]}は1000文字以内です。`);if(f[2]==='date'&&result.fields[f[0]]&&!validDate(result.fields[f[0]]))throw Error(`${f[1]}の日付を確認してください。`);}}
    const ids=new Set();
    result.steps=result.steps.map(s=>{
      if(!s||typeof s!=='object'||typeof s.id!=='string'||!s.id||ids.has(s.id))throw Error('目標工程の識別情報が重複しています。');ids.add(s.id);
      const step={...s,name:text(s.name),values:{...s.values}};
      if(!step.name.trim()||step.name.length>200)throw Error('工程名を1〜200文字で入力してください。');
      step.slots=(Array.isArray(s.slots)?s.slots:[]).filter(k=>metrics[k]);
      step.gravityUnit=s.gravityUnit==='°P'?'°P':'SG';
      for(const k of step.slots){const m=metrics[k];if(m[2]==='number')step.values[k]=numeric(step.values[k],`${step.name}・${m[0]}`,k==='gravity'&&step.gravityUnit==='SG'?1:m[3]??0,k==='gravity'&&step.gravityUnit==='SG'?1.3:m[4]??1e9);else if(m[2]==='time'){step.values[k]=text(step.values[k]);if(step.values[k]&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(step.values[k]))throw Error(`${step.name}の時刻を確認してください。`);}else if(m[2]!=='bound'){step.values[k]=text(step.values[k]);if(step.values[k].length>1000)throw Error(`${step.name}の備考は1000文字以内です。`);}}
      step.comparisons={...s.comparisons};for(const k of Object.keys(step.comparisons))if(!['=','<','<=','>','>='].includes(step.comparisons[k]))step.comparisons[k]='=';
      return step;
    });
    return result;
  }
  function validDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
  function expandedSteps(plan){
    const saved=normalize(plan).steps;
    if(saved.length)return saved;
    return steps.map(([id,name,slots])=>({id,name,slots:slots.split(','),values:{},gravityUnit:'SG',comparisons:{}}));
  }
  function rowMeta(row){
    const meta=clone(row.targetMeta||{});
    const a=text(meta.batch1),b=text(meta.batch2),amount=text(row.amount);
    if(sum(a,b)!==amount&&Number(sum(a,b))!==Number(amount)||amount===''&&sum(a,b)!==''){meta.batch1=amount;meta.batch2='';}
    if(meta.batch1==null&&meta.batch2==null){meta.batch1=amount;meta.batch2='';}
    return meta;
  }
  function validateRow(type,row){
    const r=clone(row),m={...r.targetMeta};r.name=text(r.name).trim();
    m.batch1=numeric(m.batch1,`${r.name||'原材料'} Batch 1`);m.batch2=numeric(m.batch2,`${r.name||'原材料'} Batch 2`);
    if(!r.name&&(m.batch1!==''||m.batch2!==''))throw Error('数量を入力した原材料の名称も入力してください。');
    r.amount=sum(m.batch1,m.batch2);r.targetMeta=m;
    for(const k of ['manufacturer','lot','timingNote']){m[k]=text(m[k]);if(m[k].length>300)throw Error('メーカー・ロット・投入条件は300文字以内です。');}
    if(type==='hop'){m.alpha=numeric(m.alpha,'ホップα酸',0,100);m.ibu=numeric(m.ibu,'ホップ目標IBU');r.timingValue=numeric(r.timingValue,'ホップ投入タイミング');if(!['boil','dryhop'].includes(r.timingType))throw Error('ホップ投入方法を選択してください。');}
    if(type==='mineral'){m.concentration=numeric(m.concentration,'添加剤濃度',0,100);}
    if(!r.name&&Object.entries(m).some(([k,v])=>!['batch1','batch2'].includes(k)&&v!=null&&text(v).trim()!==''))throw Error('成分・ロット等を入力した原材料の名称も入力してください。');
    return r;
  }
  function waterPlan(plan,total){const p=normalize(plan),m=rowMeta({amount:text(total),targetMeta:{batch1:p.fields.mashWater1,batch2:p.fields.mashWater2}});p.fields.mashWater1=m.batch1;p.fields.mashWater2=m.batch2;return p;}
  function scalePlan(plan,ratio){const p=normalize(plan);for(const f of fields){if(f[3]==='L'&&p.fields[f[0]]!=='')p.fields[f[0]]=String(Number(p.fields[f[0]])*ratio);}for(const s of p.steps){if(s.values.volume!=null&&s.values.volume!=='')s.values.volume=String(Number(s.values.volume)*ratio);}return p;}
  function scaleMeta(meta,ratio){const m=clone(meta||{});for(const k of ['batch1','batch2'])if(m[k]!=null&&m[k]!=='')m[k]=String(Math.round(Number(m[k])*ratio*1e6)/1e6);return m;}
  const api={fields,steps,metrics,rowTypes,empty,normalize,expandedSteps,rowMeta,validateRow,waterPlan,numeric,sum,scalePlan,scaleMeta};
  root.BrewTargets=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
