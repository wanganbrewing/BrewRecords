let recordSearch='',recordStatus='';
function preferredInventoryMode(){
  try{const value=localStorage.getItem('ferment-inventory-view-v1');if(['cards','stock','ledger'].includes(value))return value;}catch(error){}
  return typeof matchMedia==='function'&&matchMedia('(min-width:1000px)').matches?'stock':'cards';
}
function rememberInventoryMode(mode){
  try{localStorage.setItem('ferment-inventory-view-v1',mode);}catch(error){}
}
function recordMatches(batch,query,status){
  const text=[batch.batchName,batch.style,batch.brewDate].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase();
  const words=String(query||'').normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (!status||statusOf(batch)===status)&&words.every(word=>text.includes(word));
}
function recordFiltersHtml(){
  return `<div class="record-filters"><div class="field"><label for="recordSearch">記録を検索</label><input type="search" id="recordSearch" value="${escapeHtml(recordSearch)}" placeholder="仕込み名・スタイル・日付" oninput="recordSearch=this.value;applyRecordFilters()"></div><div class="field"><label for="recordStatus">状態</label><select id="recordStatus" onchange="recordStatus=this.value;applyRecordFilters()">${['','仕込み中','発酵中','完了'].map(s=>`<option value="${s}" ${s===recordStatus?'selected':''}>${s||'すべて'}</option>`).join('')}</select></div><button type="button" class="btn btn-ghost" onclick="clearRecordFilters()">絞り込みを解除</button></div><p id="recordFilterCount" role="status"></p>`;
}
function applyRecordFilters(){
  const matching=new Set(batches.filter(b=>recordMatches(b,recordSearch,recordStatus)).map(b=>b.id));
  document.querySelectorAll('#viewList .batch-card').forEach(card=>{card.hidden=!matching.has(card.dataset.batchId);});
  if($('recordFilterCount'))$('recordFilterCount').textContent=`${matching.size}件 / 全${batches.length}件`;
  if($('recordNoMatches'))$('recordNoMatches').hidden=matching.size>0;
}
function clearRecordFilters(){
  recordSearch='';recordStatus='';if($('recordSearch'))$('recordSearch').value='';if($('recordStatus'))$('recordStatus').value='';applyRecordFilters();
}
document.addEventListener('DOMContentLoaded',()=>setInventoryMode(preferredInventoryMode(),false));
