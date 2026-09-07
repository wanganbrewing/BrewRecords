(function(root){
  'use strict';
  const defaults={version:1,breweryName:'',staff:[],tankPrefix:'FV',tankCount:8,batchPrefix:'',batchDigits:3,updatedAt:''};
  const text=(value,max,label)=>{const clean=String(value||'').trim().normalize('NFKC');if(clean.length>max)throw Error(`${label}は${max}文字以内で入力してください。`);return clean;};
  const integer=(value,min,max,label)=>{const number=Number(value);if(!Number.isInteger(number)||number<min||number>max)throw Error(`${label}は${min}〜${max}で入力してください。`);return number;};
  function normalize(value){
    const source=value&&typeof value==='object'?value:{};
    const staffSource=Array.isArray(source.staff)?source.staff:String(source.staff||'').split(/\r?\n|,/);
    const staff=[],seen=new Set();
    staffSource.forEach(value=>{const name=text(value,80,'担当者名');if(!name)return;const key=name.toLocaleLowerCase('ja');if(!seen.has(key)){seen.add(key);staff.push(name);}});
    if(staff.length>30)throw Error('担当者は30名以内で登録してください。');
    return {
      version:1,
      breweryName:text(source.breweryName,120,'醸造所名'),
      staff,
      tankPrefix:text(source.tankPrefix==null?defaults.tankPrefix:source.tankPrefix,12,'タンク名の接頭辞')||defaults.tankPrefix,
      tankCount:integer(source.tankCount==null?defaults.tankCount:source.tankCount,1,30,'標準タンク数'),
      batchPrefix:text(source.batchPrefix,20,'バッチ番号の接頭辞'),
      batchDigits:integer(source.batchDigits==null?defaults.batchDigits:source.batchDigits,1,6,'バッチ番号の桁数'),
      updatedAt:String(source.updatedAt||'')
    };
  }
  function merge(local,incoming){const a=normalize(local),b=normalize(incoming);return b.updatedAt>a.updatedAt?b:a;}
  function tankNames(value){const settings=normalize(value);return Array.from({length:settings.tankCount},(_,index)=>`${settings.tankPrefix}${index+1}`);}
  function hasActivity(value){const settings=normalize(value);return settings.breweryName!==defaults.breweryName||settings.staff.length>0||settings.tankPrefix!==defaults.tankPrefix||settings.tankCount!==defaults.tankCount||settings.batchPrefix!==defaults.batchPrefix||settings.batchDigits!==defaults.batchDigits;}
  const api={defaults:Object.freeze({...defaults,staff:[]}),normalize,merge,tankNames,hasActivity};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.AppSettings=api;
})(typeof window==='object'?window:this);
