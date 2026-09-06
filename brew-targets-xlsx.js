(function(root,factory){
  'use strict';
  const api=factory(root.BrewTargets||(typeof require==='function'?require('./brew-targets.js'):null));
  root.BrewTargetWorkbook=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(BrewTargets){
  'use strict';
  const FORMAT_ID='FermentersLedgerTargetPlan';
  const SCHEMA_VERSION=1;
  const SHEETS=['基本計画','原材料・水','仕込み工程','管理情報'];
  const CATEGORY_LABELS={fermentable:'モルト',hop:'ホップ',adjunct:'副原料',mineral:'水質調整剤',yeast:'酵母'};
  const LABEL_CATEGORIES=Object.fromEntries(Object.entries(CATEGORY_LABELS).map(([key,value])=>[value,key]));
  const FIELD_DEFS=[
    ['基本','batchName','バッチ名','text',''],['基本','style','スタイル','text',''],['基本','batchIcon','仕込みアイコン（auto / beer / wine / sake / cider / mead / other）','text',''],['基本','taxCategory','酒税法上の品目区分','text',''],['基本','brewDate','仕込み予定日','date',''],['基本','brewer','担当者','text',''],['基本','batchSize','予定仕込み量','number','L'],
    ['仕込み目標','targetOG','目標OG','number','SG'],['仕込み目標','mashTemp','目標糖化温度','number','℃'],['仕込み目標','mashTime','目標糖化時間','number','分'],['仕込み目標','boilTime','目標煮沸時間','number','分'],
    ['設備','batchNumber','バッチ番号','text',''],['設備','tradeName','帳簿・取引先向け名称','text',''],['設備','productName','商品名','text',''],['設備','tank','使用予定タンク','text',''],['設備','sanitizeDate','洗浄・殺菌の予定日','date',''],['設備','sanitizeBy','洗浄・殺菌の予定担当','text',''],['設備','millGap','ミルギャップ','number','mm'],
    ['仕上がり','targetFG','目標FG','number','SG'],['仕上がり','targetABV','目標ABV','number','%'],['仕上がり','targetIBU','目標合計IBU','number','IBU'],['仕上がり','targetLoss','目標欠減量','number','L'],['仕上がり','targetCost','目標原価/L','number','円/L'],['仕上がり','planNotes','仕込み計画メモ','text',''],
    ['酵母','yeastSource','酵母の由来','text',''],['酵母','yeastGeneration','酵母の世代','text',''],['酵母','yeastHarvestDate','酵母回収予定日','date',''],['酵母','pitchRate','酵母投入率 目標','number',''],['酵母','pitchRateUnit','投入率の単位','text',''],['酵母','cellDensity','細胞密度 目標','number','×10⁶ cells/mL']
  ];
  const WATER_DEFS=[
    ['水量','mashWater1','糖化用水 仕込み1回目','number','L','extra'],['水量','mashWater2','糖化用水 仕込み2回目','number','L','extra'],['水量','spargeWater1','スパージ水 仕込み1回目','number','L','extra'],['水量','spargeWater2','スパージ水 仕込み2回目','number','L','extra'],['水量','waterVolume','糖化用水 合計','number','L','bound'],
    ['原水','waterSource','水源','text','','bound'],['原水','waterPh','原水pH','number','','bound'],['原水','waterAlkalinity','原水アルカリ度','number','mg/L as CaCO₃','bound'],['原水','targetWaterPh','目標仕込み水pH','number','','bound'],['原水','phAcidType','pH調整に使用する酸（管理キー）','text','','bound'],
    ['原水ミネラル','sCa','原水 Ca²⁺','number','ppm','bound'],['原水ミネラル','sMg','原水 Mg²⁺','number','ppm','bound'],['原水ミネラル','sNa','原水 Na⁺','number','ppm','bound'],['原水ミネラル','sCl','原水 Cl⁻','number','ppm','bound'],['原水ミネラル','sSO4','原水 SO₄²⁻','number','ppm','bound'],['原水ミネラル','sHCO3','原水 HCO₃⁻','number','ppm','bound'],
    ['目標ミネラル','mCa','Ca²⁺','number','ppm','bound'],['目標ミネラル','mMg','Mg²⁺','number','ppm','bound'],['目標ミネラル','mNa','Na⁺','number','ppm','bound'],['目標ミネラル','mCl','Cl⁻','number','ppm','bound'],['目標ミネラル','mSO4','SO₄²⁻','number','ppm','bound'],['目標ミネラル','mHCO3','HCO₃⁻','number','ppm','bound'],
    ['目標ミネラル','sulfateChlorideRatio','SO₄ / Cl 目標比','number','','extra'],['目標ミネラル','residualAlkalinity','残留アルカリ度 目標','number','mg/L as CaCO₃','extra']
  ];
  const MATERIAL_HEADERS=['行種別','分類・区分','名称・項目','仕込み1回目・値','仕込み2回目','単位','在庫品目','メーカー','ロット','α酸（%）','投入方法・先','投入時期','目標IBU','投入条件','濃度（%）','管理キー','在庫ID（参考）'];
  const PROCESS_HEADERS=['順番','工程名','予定時刻','時間（分）','温度（℃）','液量（L）','比重・糖度','比重単位','比重条件','目標OG（SG）','目標糖度（°P）','pH','pH条件','流量（L/分）','圧力（bar）','条件・備考','管理ID','入力項目'];
  const BASIC_HEADERS=['区分','項目','値','単位','管理キー'];
  const trim=v=>v==null?'':String(v).normalize('NFKC').trim();
  const clone=v=>JSON.parse(JSON.stringify(v));
  const xlsxFrom=options=>options?.xlsx||(typeof XLSX!=='undefined'?XLSX:null);
  const asExcelValue=(value,type)=>type==='number'&&trim(value)!==''&&Number.isFinite(Number(value))?Number(value):value??'';
  const safeFilename=name=>trim(name).replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,70)||'名称未設定';
  function assertReady(){if(!BrewTargets)throw Error('仕込み計画の処理を読み込めませんでした。画面を再読み込みしてください。');}
  function planFrom(batch){assertReady();return BrewTargets.normalize(batch?.brewTargets);}
  function findInventory(inventory,id){return (inventory||[]).find(item=>item.id===id);}
  function inventoryMeta(inventory,row){const item=findInventory(inventory,row?.invId);return {name:item?.name||'',manufacturer:row?.targetMeta?.manufacturer||item?.manufacturer||'',lot:row?.targetMeta?.lot||item?.lotCode||'',id:row?.invId||''};}
  function fieldRows(batch,plan){return FIELD_DEFS.map(([group,key,label,type,unit])=>[group,label,asExcelValue(plan.fields[key]!==undefined?plan.fields[key]:batch?.[key],type),unit,key]);}
  function materialRows(batch,plan,inventory){
    const rows=WATER_DEFS.map(([group,key,label,type,unit,scope])=>['水質・水量',group,label,asExcelValue(scope==='extra'?plan.fields[key]:batch?.[key],type),'',unit,'','','','','','','','','',key,'']);
    for(const [type,[arrayKey,defaultUnit]] of Object.entries(BrewTargets.rowTypes))for(const row of batch?.[arrayKey]||[]){
      const meta=BrewTargets.rowMeta(row),inv=inventoryMeta(inventory,row),unit=type==='adjunct'?(row.unit||defaultUnit):defaultUnit;
      rows.push(['原材料',CATEGORY_LABELS[type],row.name||'',asExcelValue(meta.batch1,'number'),asExcelValue(meta.batch2,'number'),unit,inv.name,inv.manufacturer,inv.lot,asExcelValue(meta.alpha,'number'),row.timingType||row.timing||'',asExcelValue(row.timingValue,'number'),asExcelValue(meta.ibu,'number'),meta.timingNote||'',asExcelValue(meta.concentration,'number'),type,row.invId||'']);
    }
    if(trim(batch?.yeast)||trim(batch?.yeastAmount)){
      const row={name:batch.yeast,invId:batch.yeastInvId,targetMeta:{}},inv=inventoryMeta(inventory,row);
      rows.push(['原材料',CATEGORY_LABELS.yeast,batch.yeast||'',asExcelValue(batch.yeastAmount,'number'),'',batch.yeastUnit||'g',inv.name,inv.manufacturer,inv.lot,'','','','','','','yeast',batch.yeastInvId||'']);
    }
    return rows;
  }
  function stepValue(step,key,batch){
    if(!step.slots.includes(key))return '';
    const metric=BrewTargets.metrics[key];
    return metric[2]==='bound'?batch?.[key]??'':step.values?.[key]??'';
  }
  function processRows(batch,plan){return BrewTargets.expandedSteps(plan).map((step,index)=>[
    index+1,step.name,stepValue(step,'time',batch),asExcelValue(step.slots.includes('mashTime')?stepValue(step,'mashTime',batch):step.slots.includes('boilTime')?stepValue(step,'boilTime',batch):stepValue(step,'duration',batch),'number'),
    asExcelValue(step.slots.includes('mashTemp')?stepValue(step,'mashTemp',batch):stepValue(step,'temp',batch),'number'),asExcelValue(stepValue(step,'volume',batch),'number'),asExcelValue(stepValue(step,'gravity',batch),'number'),step.gravityUnit||'SG',step.comparisons?.gravity||'=',asExcelValue(stepValue(step,'targetOG',batch),'number'),asExcelValue(stepValue(step,'plato',batch),'number'),asExcelValue(stepValue(step,'ph',batch),'number'),step.comparisons?.ph||'=',asExcelValue(stepValue(step,'flow',batch),'number'),asExcelValue(stepValue(step,'pressure',batch),'number'),stepValue(step,'note',batch),step.id,step.slots.join(',')
  ]);}
  function makeSheet(xlsx,rows,widths){const ws=xlsx.utils.aoa_to_sheet(rows);ws['!cols']=widths.map(w=>({wch:w}));if(rows.length)ws['!autofilter']={ref:`A1:${xlsx.utils.encode_col(rows[0].length-1)}${rows.length}`};return ws;}
  function buildWorkbook(batch,inventory=[],options={}){
    assertReady();const xlsx=xlsxFrom(options);if(!xlsx)throw Error('Excel機能を読み込めませんでした。画面を再読み込みしてください。');
    const plan=planFrom(batch),wb=xlsx.utils.book_new();
    const basic=makeSheet(xlsx,[BASIC_HEADERS,...fieldRows(batch,plan)],[14,30,32,18,22]);
    const materials=makeSheet(xlsx,[MATERIAL_HEADERS,...materialRows(batch,plan,inventory)],[13,15,28,18,18,13,28,22,18,13,18,15,13,24,13,18,22]);
    const process=makeSheet(xlsx,[PROCESS_HEADERS,...processRows(batch,plan)],[8,34,13,13,13,13,16,12,12,15,17,11,11,15,13,30,20,36]);
    const infoRows=[['項目','値'],['formatId',FORMAT_ID],['schemaVersion',SCHEMA_VERSION],['applicationName',"Fermenter's Ledger"],['appVersion',options.appVersion??''],['exportedAt',options.exportedAt||new Date().toISOString()],['sourceBatchId',batch?.id||''],['recordPolicy','予定・目標のみ。実測値・発酵記録・在庫消費は含みません。'],['importPolicy','新しい仕込みの下書きとして読み込みます。']];
    const info=makeSheet(xlsx,infoRows,[24,72]);
    for(const [sheet,name] of [[basic,SHEETS[0]],[materials,SHEETS[1]],[process,SHEETS[2]],[info,SHEETS[3]]])xlsx.utils.book_append_sheet(wb,sheet,name);
    wb.Props={Title:`目標仕込み表 ${batch?.batchName||''}`,Subject:'予定・目標データ',Author:"Fermenter's Ledger",CreatedDate:new Date()};
    return wb;
  }
  function exportWorkbook(batch,inventory=[],options={}){
    const xlsx=xlsxFrom(options),wb=buildWorkbook(batch,inventory,options),date=trim(batch?.brewDate)||new Date().toISOString().slice(0,10),filename=`仕込み計画_${safeFilename(batch?.batchName)}_${date}.xlsx`;
    xlsx.writeFile(wb,filename,{compression:true});return filename;
  }
  function sheetObjects(xlsx,wb,name,headers){
    const ws=wb.Sheets[name];if(!ws)throw Error(`「${name}」シートがありません。アプリから書き出したExcelを選んでください。`);
    const rows=xlsx.utils.sheet_to_json(ws,{defval:'',raw:true});if(!rows.length&&name!=='基本計画')return [];
    const first=xlsx.utils.sheet_to_json(ws,{header:1,defval:'',raw:true})[0]||[];
    for(const header of headers)if(!first.includes(header))throw Error(`「${name}」シートの「${header}」列がありません。列名は変更しないでください。`);
    return rows;
  }
  function dateCell(value,xlsx,label){
    if(value===''||value==null)return '';
    if(typeof value==='number'){
      const d=xlsx.SSF.parse_date_code(value);if(d)return `${String(d.y).padStart(4,'0')}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    }
    const text=trim(value);if(!/^\d{4}-\d{2}-\d{2}$/.test(text))throw Error(`${label}はYYYY-MM-DD形式で入力してください。`);return text;
  }
  function valueFor(value,type,xlsx,label){if(value===''||value==null)return '';if(type==='date')return dateCell(value,xlsx,label);return trim(value);}
  function exactInventoryMatch(inventory,category,name,manufacturer,lot){
    const key=v=>trim(v).toLocaleLowerCase();
    return (inventory||[]).filter(item=>item.category===category&&key(item.name)===key(name)&&key(item.manufacturer)===key(manufacturer)&&key(item.lotCode)===key(lot));
  }
  function importFieldRows(rows,batch,plan,xlsx){
    const defs=new Map([...FIELD_DEFS,...WATER_DEFS.map(([group,key,label,type,unit,scope])=>[group,key,label,type,unit,scope])].map(def=>[def[1],def]));
    const seen=new Set();
    for(const row of rows){const key=trim(row['管理キー']);if(!key)continue;if(!defs.has(key))continue;if(seen.has(key))throw Error(`管理キー「${key}」が重複しています。`);seen.add(key);const def=defs.get(key),value=valueFor(row['値']??row['仕込み1回目・値'],def[3],xlsx,def[2]),scope=def[5]||(!FIELD_DEFS.some(d=>d[1]===key)?'bound':'auto');
      if(scope==='extra'||BrewTargets.fields.some(d=>d[0]===key))plan.fields[key]=value;else batch[key]=value;
    }
  }
  function importMaterials(rows,batch,plan,inventory,xlsx,warnings){
    const waterRows=rows.filter(row=>trim(row['行種別'])==='水質・水量');
    importFieldRows(waterRows,batch,plan,xlsx);
    const arrays={fermentable:[],hop:[],adjunct:[],mineral:[]};let yeastCount=0;
    for(const row of rows.filter(item=>trim(item['行種別'])==='原材料')){
      const label=trim(row['分類・区分']),type=LABEL_CATEGORIES[label]||trim(row['管理キー']);if(!CATEGORY_LABELS[type])throw Error(`原材料の分類「${label}」を確認してください。`);
      const name=trim(row['名称・項目']),manufacturer=trim(row['メーカー']),lot=trim(row['ロット']),unit=trim(row['単位']);
      const batch1=valueFor(row['仕込み1回目・値'],'number',xlsx,`${name||label}の量`),batch2=valueFor(row['仕込み2回目'],'number',xlsx,`${name||label}の量`);
      if(type==='yeast'){
        if(++yeastCount>1)throw Error('酵母はExcel内で1行にまとめてください。');
        batch.yeast=name;batch.yeastAmount=BrewTargets.numeric(batch1,'酵母の量');batch.yeastUnit=unit||'g';
        const inventoryName=trim(row['在庫品目']);if(inventoryName){const matches=exactInventoryMatch(inventory,'yeast',inventoryName,manufacturer,lot);if(matches.length===1&&matches[0].unit===batch.yeastUnit)batch.yeastInvId=matches[0].id;else warnings.push(`酵母「${name}」は在庫と未連携で読み込みます。`);}
        continue;
      }
      const meta={batch1,batch2,manufacturer,lot,alpha:valueFor(row['α酸（%）'],'number',xlsx,'α酸'),ibu:valueFor(row['目標IBU'],'number',xlsx,'目標IBU'),timingNote:trim(row['投入条件']),concentration:valueFor(row['濃度（%）'],'number',xlsx,'濃度')};
      const material={name,unit:unit||BrewTargets.rowTypes[type][1],timingType:trim(row['投入方法・先'])||'boil',timing:trim(row['投入方法・先']),timingValue:valueFor(row['投入時期'],'number',xlsx,'投入時期'),targetMeta:meta};
      if(type!=='mineral'&&name&&trim(row['在庫品目'])){const inventoryName=trim(row['在庫品目']),matches=exactInventoryMatch(inventory,type,inventoryName,manufacturer,lot);if(matches.length===1&&(type!=='adjunct'||matches[0].unit===material.unit))material.invId=matches[0].id;else warnings.push(`${label}「${name}」は在庫と未連携で読み込みます。`);}
      arrays[type].push(BrewTargets.validateRow(type,material));
    }
    for(const [type,[arrayKey]] of Object.entries(BrewTargets.rowTypes))batch[arrayKey]=arrays[type];
  }
  function parseSlots(text,id){const known=new Set(Object.keys(BrewTargets.metrics)),slots=trim(text).split(',').map(v=>v.trim()).filter(v=>known.has(v));if(slots.length)return slots;const template=BrewTargets.steps.find(step=>step[0]===id);return template?template[2].split(','):[];}
  function importProcess(rows,batch,plan){
    if(rows.length>100)throw Error('仕込み工程は100行以内にしてください。');const ids=new Set();plan.steps=[];
    for(const row of rows){const name=trim(row['工程名']),id=trim(row['管理ID']);if(!name&&!id)continue;if(!name)throw Error('工程名が空欄の行があります。');if(!id||ids.has(id))throw Error('仕込み工程の管理IDが空欄または重複しています。');ids.add(id);const slots=parseSlots(row['入力項目'],id),step={id,name,slots,values:{},gravityUnit:trim(row['比重単位'])==='°P'?'°P':'SG',comparisons:{gravity:trim(row['比重条件'])||'=',ph:trim(row['pH条件'])||'='}};
      const columns={time:'予定時刻',duration:'時間（分）',temp:'温度（℃）',volume:'液量（L）',gravity:'比重・糖度',targetOG:'目標OG（SG）',plato:'目標糖度（°P）',ph:'pH',flow:'流量（L/分）',pressure:'圧力（bar）',note:'条件・備考'};
      for(const slot of slots){if(slot==='mashTime'||slot==='boilTime'){batch[slot]=trim(row['時間（分）']);continue;}if(slot==='mashTemp'){batch.mashTemp=trim(row['温度（℃）']);continue;}if(columns[slot])step.values[slot]=trim(row[columns[slot]]);}
      plan.steps.push(step);
    }
  }
  function parseWorkbook(data,inventory=[],options={}){
    assertReady();const xlsx=xlsxFrom(options);if(!xlsx)throw Error('Excel機能を読み込めませんでした。画面を再読み込みしてください。');
    const wb=xlsx.read(data,{type:options.type||'array',cellDates:false,dense:false});
    for(const name of SHEETS)if(!wb.SheetNames.includes(name))throw Error(`「${name}」シートがありません。アプリから書き出したExcelを選んでください。`);
    const infoRows=sheetObjects(xlsx,wb,'管理情報',['項目','値']),info=Object.fromEntries(infoRows.map(row=>[trim(row['項目']),row['値']]));
    if(trim(info.formatId)!==FORMAT_ID||Number(info.schemaVersion)!==SCHEMA_VERSION)throw Error('このExcelは対応している目標仕込み表ではありません。アプリから書き出したファイルを使ってください。');
    const basic=sheetObjects(xlsx,wb,'基本計画',BASIC_HEADERS),materials=sheetObjects(xlsx,wb,'原材料・水',MATERIAL_HEADERS),process=sheetObjects(xlsx,wb,'仕込み工程',PROCESS_HEADERS);
    if(materials.length>1000)throw Error('原材料・水の行数が多すぎます。1000行以内にしてください。');
    const batch={id:'',batchName:'',style:'',brewDate:'',brewer:'',batchSize:'',actualOG:'',fermentStart:'',fermentTemp:'',fermentStartPh:'',gravityLog:[],fg:'',packageDate:'',packages:[],completed:false,inventoryDeducted:false,customScheduleSteps:[],processMeasurements:[],otherCosts:[],otherCostsReviewed:false,otherCostHistory:[]};
    const plan=BrewTargets.empty(),warnings=[];importFieldRows(basic,batch,plan,xlsx);importMaterials(materials,batch,plan,inventory,xlsx,warnings);importProcess(process,batch,plan);plan.fields.doubleBrew=materials.some(row=>trim(row['仕込み2回目'])!=='');batch.brewTargets=BrewTargets.waterPlan(BrewTargets.normalize(plan),batch.waterVolume);
    for(const [key,label,type] of [['batchName','バッチ名','text'],['batchSize','予定仕込み量','number'],['targetOG','目標OG','number'],['mashTemp','目標糖化温度','number'],['mashTime','目標糖化時間','number'],['boilTime','目標煮沸時間','number'],['waterVolume','糖化用水合計','number'],['waterPh','原水pH','number'],['waterAlkalinity','原水アルカリ度','number'],['targetWaterPh','目標仕込み水pH','number'],['sCa','原水Ca','number'],['sMg','原水Mg','number'],['sNa','原水Na','number'],['sCl','原水Cl','number'],['sSO4','原水SO4','number'],['sHCO3','原水HCO3','number'],['mCa','Ca','number'],['mMg','Mg','number'],['mNa','Na','number'],['mCl','Cl','number'],['mSO4','SO4','number'],['mHCO3','HCO3','number']])if(batch[key]!==''&&type==='number')batch[key]=BrewTargets.numeric(batch[key],label,key==='targetOG'?1:0,key==='targetOG'?1.3:1e9);
    if(!['auto','beer','wine','sake','cider','mead','other'].includes(batch.batchIcon))batch.batchIcon='auto';
    if(!['lactic88','lactic80','phosphoric10','phosphoric75'].includes(batch.phAcidType))batch.phAcidType='lactic88';
    const materialCount=Object.values(BrewTargets.rowTypes).reduce((sum,[key])=>sum+(batch[key]?.length||0),0)+(batch.yeast?1:0),targetSteps=batch.brewTargets.steps.filter(step=>Object.values(step.values).some(v=>trim(v)!=='')||step.slots.some(slot=>BrewTargets.metrics[slot]?.[2]==='bound'&&trim(batch[slot])!=='')).length;
    return {batch,warnings:[...new Set(warnings)],summary:{batchName:batch.batchName||'名称未設定',brewDate:batch.brewDate||'未設定',materialCount,targetStepCount:targetSteps,doubleBrew:batch.brewTargets.fields.doubleBrew,sourceAppVersion:trim(info.appVersion)}};
  }
  return {FORMAT_ID,SCHEMA_VERSION,SHEETS,FIELD_DEFS,WATER_DEFS,MATERIAL_HEADERS,PROCESS_HEADERS,buildWorkbook,exportWorkbook,parseWorkbook,safeFilename};
});
