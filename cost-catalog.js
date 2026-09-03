(function(root){
  'use strict';
  const expenses=typeof module==='object'&&module.exports?require('./batch-expenses.js'):root.BatchExpenses;
  const units=['mL','L','g','kg','個','回（1仕込み）'];
  function normalizeItem(item){
    if(!item||!item.id||typeof item.id!=='string')throw Error('消耗品IDが不正です。');
    const name=String(item.name||'').trim(),category=String(item.category||'');
    if(!name||name.length>120||!Object.hasOwn(expenses.categories,category))throw Error('品名と分類を確認してください。');
    if(!units.includes(item.unit))throw Error('単位を選択してください。');
    if(item.rate==null||String(item.rate).trim()==='')throw Error('参考単価を入力してください。');
    const rate=Number(item.rate);
    if(!Number.isFinite(rate)||rate<0||rate>1e9||Math.abs(rate*10000-Math.round(rate*10000))>0.0001)throw Error('参考単価は0〜10億円、小数第4位までで入力してください。');
    const note=String(item.note||'').trim();if(note.length>300)throw Error('メモは300文字以内にしてください。');
    return {id:item.id,name,category,unit:item.unit,rate,note,revision:Number.isSafeInteger(item.revision)&&item.revision>0?item.revision:1,archived:item.archived===true};
  }
  function normalize(book){
    if(book==null)return {items:[],history:[]};
    if(!Array.isArray(book.items)||!Array.isArray(book.history))throw Error('消耗品・参考単価データの形式が不正です。');
    if(book.history.some(h=>!h||typeof h!=='object'||typeof h.id!=='string'))throw Error('参考単価の変更履歴が不正です。');
    const items=book.items.map(normalizeItem),ids=new Set(items.map(i=>i.id));
    if(ids.size!==items.length)throw Error('消耗品IDが重複しています。');
    return JSON.parse(JSON.stringify({items,history:book.history}));
  }
  function revise(book,item,reason,stamp,id){
    const next=normalize(book),before=next.items.find(i=>i.id===item.id)||null;
    const after=normalizeItem({...item,revision:before?before.revision+1:1});
    if(next.items.some(i=>i.id!==after.id&&!i.archived&&!after.archived&&i.category===after.category&&i.name.toLowerCase()===after.name.toLowerCase()&&i.unit===after.unit))throw Error('同じ分類・品名・単位が登録済みです。');
    if(!String(reason||'').trim()||String(reason).length>300)throw Error('保存理由を300文字以内で入力してください。');
    if(before&&JSON.stringify({...before,revision:1})===JSON.stringify({...after,revision:1}))throw Error('変更がありません。');
    next.items=before?next.items.map(i=>i.id===after.id?after:i):[...next.items,after];
    next.history.push({id,recordedAt:stamp,reason:String(reason).trim(),before,after});return next;
  }
  function merge(local,incoming){
    const a=normalize(local),b=normalize(incoming),ids=new Set(a.items.map(i=>i.id));
    b.items.forEach(i=>{if(!ids.has(i.id)){a.items.push(i);ids.add(i.id);}});
    const hist=new Set(a.history.map(h=>h.id));b.history.forEach(h=>{if(!hist.has(h.id)){a.history.push(h);hist.add(h.id);}});return a;
  }
  function expense(item,id){
    const p=normalizeItem(item);if(p.archived)throw Error('非表示の消耗品は新しく追加できません。');
    return {id,category:p.category,name:p.name,date:'',amount:'',percent:100,reference:'',note:p.note,pricing:{catalogId:p.id,revision:p.revision,unit:p.unit,rate:p.rate,quantity:p.unit==='回（1仕込み）'?1:''}};
  }
  const api={units,normalizeItem,normalize,revise,merge,expense};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.CostCatalog=api;
})(typeof window==='object'?window:this);
