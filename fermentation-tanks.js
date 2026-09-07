(function(root){
  'use strict';
  const stepKeys=['water','alkali','rinse','sanitize'];
  const stepLabels={water:'水洗い',alkali:'アルカリ洗浄',rinse:'リンス',sanitize:'殺菌'};
  const sanitizeMethods=['熱湯','殺菌剤'];
  const defaultNames=Array.from({length:8},(_,index)=>`FV${index+1}`);
  const clone=value=>JSON.parse(JSON.stringify(value));
  const normalizedName=value=>String(value||'').trim().normalize('NFKC');
  function blankStep(){return {done:false,date:'',person:'',method:''};}
  function blankTank(name,id,custom=false){
    return {id,name,custom,steps:Object.fromEntries(stepKeys.map(key=>[key,blankStep()])),updatedAt:''};
  }
  function defaultBook(){
    return {version:1,tanks:defaultNames.map((name,index)=>blankTank(name,`default-fv${index+1}`))};
  }
  function normalizeStep(value,key){
    const source=value&&typeof value==='object'?value:{};
    const date=String(source.date||'').trim(),person=String(source.person||'').trim();
    const dateValue=date?new Date(date+'T00:00:00Z'):null;
    if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(dateValue.getTime())||dateValue.toISOString().slice(0,10)!==date))throw Error(`${stepLabels[key]}の日付を確認してください。`);
    if(person.length>80)throw Error(`${stepLabels[key]}の担当者は80文字以内で入力してください。`);
    const method=key==='sanitize'?String(source.method||'').trim():'';
    if(method&&!sanitizeMethods.includes(method))throw Error('殺菌方法は「熱湯」または「殺菌剤」を選択してください。');
    return {done:source.done===true,date,person,method};
  }
  function normalizeTank(value){
    if(!value||typeof value!=='object')throw Error('発酵タンクのデータ形式が正しくありません。');
    const id=String(value.id||'').trim(),name=normalizedName(value.name);
    if(!id||id.length>100)throw Error('発酵タンクIDを確認してください。');
    if(!name||name.length>60)throw Error('発酵タンク名は60文字以内で入力してください。');
    const steps=Object.fromEntries(stepKeys.map(key=>[key,normalizeStep(value.steps?.[key],key)]));
    return {id,name,custom:value.custom===true,steps,updatedAt:String(value.updatedAt||'')};
  }
  function normalize(book){
    if(book==null)return defaultBook();
    if(!book||!Array.isArray(book.tanks))throw Error('発酵タンク管理データの形式が正しくありません。');
    const tanks=book.tanks.map(normalizeTank),names=new Set();
    tanks.forEach(tank=>{const key=normalizedName(tank.name).toLocaleLowerCase('ja');if(names.has(key))throw Error('同じ名前の発酵タンクが重複しています。');names.add(key);});
    defaultNames.forEach((name,index)=>{const key=name.toLocaleLowerCase('ja');if(!names.has(key)){tanks.push(blankTank(name,`default-fv${index+1}`));names.add(key);}});
    tanks.sort((a,b)=>{
      const ai=defaultNames.indexOf(a.name),bi=defaultNames.indexOf(b.name);
      if(ai>=0||bi>=0)return (ai>=0?ai:999)-(bi>=0?bi:999);
      return a.name.localeCompare(b.name,'ja');
    });
    return clone({version:1,tanks});
  }
  function completed(step,key){
    return Boolean(step?.done&&step.date&&String(step.person||'').trim()&&(key!=='sanitize'||sanitizeMethods.includes(step.method)));
  }
  function status(tank){
    const steps=normalizeTank(tank).steps;
    if(stepKeys.every(key=>completed(steps[key],key)))return '充てん可能';
    if(completed(steps.sanitize,'sanitize'))return '殺菌済（工程未完了）';
    if(completed(steps.rinse,'rinse'))return 'リンス';
    if(completed(steps.alkali,'alkali'))return 'アルカリ洗浄済';
    if(completed(steps.water,'water'))return '水洗い';
    if(stepKeys.some(key=>steps[key].done||steps[key].date||steps[key].person||steps[key].method))return '記録未完了';
    return '未清掃';
  }
  function add(book,name,id){
    const next=normalize(book),clean=normalizedName(name);
    if(!clean||clean.length>60)throw Error('追加するタンク名を60文字以内で入力してください。');
    if(next.tanks.some(tank=>normalizedName(tank.name).toLocaleLowerCase('ja')===clean.toLocaleLowerCase('ja')))throw Error(`${clean}は登録済みです。`);
    next.tanks.push(blankTank(clean,id,true));return normalize(next);
  }
  function reset(book,id){
    const next=normalize(book),tank=next.tanks.find(item=>item.id===id);
    if(!tank)throw Error('発酵タンクが見つかりません。');
    tank.steps=blankTank(tank.name,tank.id,tank.custom).steps;tank.updatedAt='';return next;
  }
  function remove(book,id){
    const next=normalize(book),tank=next.tanks.find(item=>item.id===id);
    if(!tank)throw Error('発酵タンクが見つかりません。');
    if(!tank.custom)throw Error('FV1〜FV8は削除できません。');
    next.tanks=next.tanks.filter(item=>item.id!==id);return normalize(next);
  }
  function merge(local,incoming){
    const base=normalize(local),other=normalize(incoming),byName=new Map(base.tanks.map(tank=>[normalizedName(tank.name).toLocaleLowerCase('ja'),tank]));
    other.tanks.forEach(tank=>{
      const key=normalizedName(tank.name).toLocaleLowerCase('ja'),existing=byName.get(key);
      if(!existing){base.tanks.push(clone(tank));byName.set(key,tank);return;}
      if(String(tank.updatedAt||'')>String(existing.updatedAt||''))Object.assign(existing,clone(tank),{id:existing.id});
    });
    return normalize(base);
  }
  function hasActivity(book){
    const data=normalize(book);
    return data.tanks.some(tank=>tank.custom||tank.updatedAt||stepKeys.some(key=>{const step=tank.steps[key];return step.done||step.date||step.person||step.method;}));
  }
  function findByName(book,name){
    const key=normalizedName(name).toLocaleLowerCase('ja');
    return normalize(book).tanks.find(tank=>normalizedName(tank.name).toLocaleLowerCase('ja')===key)||null;
  }
  const api={stepKeys,stepLabels,sanitizeMethods,defaultNames,defaultBook,normalize,status,add,reset,remove,merge,hasActivity,findByName};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.FermentationTanks=api;
})(typeof window==='object'?window:this);
