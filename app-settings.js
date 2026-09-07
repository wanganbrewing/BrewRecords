(function(root){
  'use strict';
  const materialCategories=['fermentable','hop','yeast','adjunct'];
  const materialUnits={fermentable:'kg',hop:'g',yeast:'g',adjunct:'g'};
  const defaults={
    version:2,breweryName:'',staff:[],tankPrefix:'FV',tankCount:8,tankCapacity:'',
    batchPrefix:'',batchDigits:3,batchReset:'continuous',fiscalStartMonth:4,
    defaultBatchSize:'',defaultTaxCategory:'',defaultStyle:'',defaultYeast:'',
    suppliers:[],customers:[],packageTypes:[],
    materialMasters:{fermentable:[],hop:[],yeast:[],adjunct:[]},
    inventoryWarnings:{fermentable:'',hop:'',yeast:'',adjunct:''},
    rawWater:{name:'',ca:'',mg:'',na:'',cl:'',so4:'',hco3:''},
    fermentationAlerts:{temperatureMin:'',temperatureMax:'',phMin:'',phMax:''},
    updatedAt:''
  };
  const text=(value,max,label)=>{const clean=String(value||'').trim().normalize('NFKC');if(clean.length>max)throw Error(`${label}は${max}文字以内で入力してください。`);return clean;};
  const integer=(value,min,max,label)=>{const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw Error(`${label}は${min}〜${max}で入力してください。`);return number;};
  const optionalNumber=(value,min,max,label,decimals=3)=>{if(value==null||String(value).trim()==='')return '';const number=Number(value);if(!Number.isFinite(number)||number<min||number>max||Math.abs(number*(10**decimals)-Math.round(number*(10**decimals)))>.00001)throw Error(`${label}は${min}〜${max}の数値で入力してください。`);return String(number);};
  function list(value,label,maxItems=100,maxLength=120){
    const source=Array.isArray(value)?value:String(value||'').split(/\r?\n|,/),result=[],seen=new Set();
    source.forEach(entry=>{const name=text(entry,maxLength,label);if(!name)return;const key=name.toLocaleLowerCase('ja');if(!seen.has(key)){seen.add(key);result.push(name);}});
    if(result.length>maxItems)throw Error(`${label}は${maxItems}件以内で登録してください。`);
    return result;
  }
  function normalizeMaterials(source){
    const value=source&&typeof source==='object'?source:{};
    return Object.fromEntries(materialCategories.map(category=>[category,list(value[category],`${category}の原材料`,200,200)]));
  }
  function normalizeWarnings(source){
    const value=source&&typeof source==='object'?source:{};
    return Object.fromEntries(materialCategories.map(category=>[category,optionalNumber(value[category],0,1e9,`${category}の在庫警告値`)]));
  }
  function normalizeRawWater(source){
    const value=source&&typeof source==='object'?source:{};
    return {name:text(value.name,120,'原水名'),ca:optionalNumber(value.ca,0,5000,'原水Ca'),mg:optionalNumber(value.mg,0,5000,'原水Mg'),na:optionalNumber(value.na,0,5000,'原水Na'),cl:optionalNumber(value.cl,0,5000,'原水Cl'),so4:optionalNumber(value.so4,0,5000,'原水SO4'),hco3:optionalNumber(value.hco3,0,5000,'原水HCO3')};
  }
  function normalizeAlerts(source){
    const value=source&&typeof source==='object'?source:{};
    const result={temperatureMin:optionalNumber(value.temperatureMin,-20,100,'発酵温度下限'),temperatureMax:optionalNumber(value.temperatureMax,-20,100,'発酵温度上限'),phMin:optionalNumber(value.phMin,0,14,'発酵pH下限'),phMax:optionalNumber(value.phMax,0,14,'発酵pH上限')};
    if(result.temperatureMin!==''&&result.temperatureMax!==''&&Number(result.temperatureMin)>Number(result.temperatureMax))throw Error('発酵温度の下限は上限以下にしてください。');
    if(result.phMin!==''&&result.phMax!==''&&Number(result.phMin)>Number(result.phMax))throw Error('発酵pHの下限は上限以下にしてください。');
    return result;
  }
  function normalize(value){
    const source=value&&typeof value==='object'?value:{};
    return {
      version:2,
      breweryName:text(source.breweryName,120,'醸造所名'),
      staff:list(source.staff,'担当者名',30,80),
      tankPrefix:text(source.tankPrefix==null?defaults.tankPrefix:source.tankPrefix,12,'タンク名の接頭辞')||defaults.tankPrefix,
      tankCount:integer(source.tankCount==null?defaults.tankCount:source.tankCount,1,30,'標準タンク数'),
      tankCapacity:optionalNumber(source.tankCapacity,0,1e7,'タンク容量'),
      batchPrefix:text(source.batchPrefix,20,'バッチ番号の接頭辞'),
      batchDigits:integer(source.batchDigits==null?defaults.batchDigits:source.batchDigits,1,6,'バッチ番号の桁数'),
      batchReset:['continuous','calendar','fiscal'].includes(source.batchReset)?source.batchReset:defaults.batchReset,
      fiscalStartMonth:integer(source.fiscalStartMonth==null?defaults.fiscalStartMonth:source.fiscalStartMonth,1,12,'年度開始月'),
      defaultBatchSize:optionalNumber(source.defaultBatchSize,0,1e7,'標準仕込み量'),
      defaultTaxCategory:text(source.defaultTaxCategory,120,'品目区分'),
      defaultStyle:text(source.defaultStyle,160,'標準スタイル'),
      defaultYeast:text(source.defaultYeast,160,'標準酵母'),
      suppliers:list(source.suppliers,'仕入先',100,200),
      customers:list(source.customers,'納品先・取引先',100,200),
      packageTypes:list(source.packageTypes,'容器',50,120),
      materialMasters:normalizeMaterials(source.materialMasters),
      inventoryWarnings:normalizeWarnings(source.inventoryWarnings),
      rawWater:normalizeRawWater(source.rawWater),
      fermentationAlerts:normalizeAlerts(source.fermentationAlerts),
      updatedAt:String(source.updatedAt||'')
    };
  }
  function merge(local,incoming){const a=normalize(local),b=normalize(incoming);return b.updatedAt>a.updatedAt?b:a;}
  function tankNames(value){const settings=normalize(value);return Array.from({length:settings.tankCount},(_,index)=>`${settings.tankPrefix}${index+1}`);}
  function materialDefinitions(value){const settings=normalize(value);return materialCategories.flatMap(category=>settings.materialMasters[category].map(name=>({category,name,unit:materialUnits[category]})));}
  function hasActivity(value){const settings=normalize(value),base=normalize(defaults);return JSON.stringify({...settings,updatedAt:''})!==JSON.stringify({...base,updatedAt:''});}
  const api={defaults:Object.freeze({...defaults,staff:[]}),materialCategories:Object.freeze([...materialCategories]),materialUnits:Object.freeze({...materialUnits}),normalize,merge,tankNames,materialDefinitions,hasActivity};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AppSettings=api;
})(typeof window==='object'?window:this);
