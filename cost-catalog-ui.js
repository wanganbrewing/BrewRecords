let costCatalog={items:[],history:[]},costCatalogReadError='',catalogEditorState=null,catalogSaving=false,formExpenseDraft=null;
async function loadCostCatalog(){
  let saved=null;try{saved=await window.storage.get('wangan-cost-catalog',false);}catch(error){}
  try{costCatalog=CostCatalog.normalize(saved?JSON.parse(saved.value):null);}catch(error){costCatalogReadError='消耗品・参考単価を読み込めません。正常なバックアップから復元してください。';}
}
function catalogSnapshot(){if(costCatalogReadError)throw Error(costCatalogReadError);return CostCatalog.normalize(costCatalog);}
async function applyCostCatalog(book){
  const next=CostCatalog.normalize(book);await window.storage.set('wangan-cost-catalog',JSON.stringify(next),false);costCatalog=next;costCatalogReadError='';renderCostCatalog();
}
function renderCostCatalog(){
  const target=$('costCatalogRows');if(!target)return;
  $('costCatalogError').textContent=costCatalogReadError;
  target.innerHTML=costCatalog.items.map(p=>`<div class="expense-row"><strong>${escapeHtml(p.name)}${p.archived?'（非表示）':''}</strong><p>${escapeHtml(BatchExpenses.categories[p.category])} ／ 参考単価 ${escapeHtml(p.rate.toLocaleString('ja-JP',{maximumFractionDigits:4}))} 円 / ${escapeHtml(p.unit)}</p><p>${escapeHtml(p.note)}</p><button type="button" class="btn btn-ghost" data-edit-catalog="${escapeHtml(p.id)}">単価・内容を変更</button></div>`).join('')||'<p>消耗品はまだ登録されていません。「＋ 参考単価を登録」から追加してください。</p>';
  if(costCatalog.history.length)target.innerHTML+=`<details><summary>参考単価の変更履歴（${costCatalog.history.length}件）</summary>${[...costCatalog.history].reverse().map(h=>`<p>${escapeHtml(h.recordedAt)} ／ ${escapeHtml(h.reason)}<br>${escapeHtml(h.after?.name||'')}：${h.before?escapeHtml(h.before.rate)+' 円 / '+escapeHtml(h.before.unit):'未登録'} → ${escapeHtml(h.after?.rate)} 円 / ${escapeHtml(h.after?.unit)}${h.after?.archived?'（非表示）':''}</p>`).join('')}</details>`;
}
function openCatalogEditor(id){
  if(catalogSaving||$('catalogDialog').open)return;
  if(costCatalogReadError){$('costCatalogError').textContent=costCatalogReadError;return;}
  const item=costCatalog.items.find(i=>i.id===id)||{id:uid(),category:'sanitizer',name:'',unit:'L',rate:'',note:'',archived:false};
  catalogEditorState={id:item.id,before:JSON.stringify(window.fermentCloudData.getSnapshot())};
  $('catalogName').value=item.name;$('catalogCategory').innerHTML=Object.entries(BatchExpenses.categories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');$('catalogCategory').value=item.category;
  $('catalogUnit').innerHTML=CostCatalog.units.map(unit=>`<option>${unit}</option>`).join('');$('catalogUnit').value=item.unit;
  $('catalogRate').value=item.rate;$('catalogNote').value=item.note;$('catalogArchived').checked=item.archived;$('catalogReason').value='';$('catalogError').textContent='';
  const dialog=$('catalogDialog');if(!dialog.dataset.ready){dialog.dataset.ready='1';dialog.addEventListener('cancel',e=>{if(catalogSaving)e.preventDefault();});dialog.addEventListener('close',()=>{catalogEditorState=null;});}
  dialog.showModal();$('catalogTitle').focus({preventScroll:true});dialog.scrollTop=0;
}
async function saveCatalogEditor(){
  if(!catalogEditorState||catalogSaving)return;
  $('catalogError').textContent='';const state=catalogEditorState;
  try{
    if(state.before!==JSON.stringify(window.fermentCloudData.getSnapshot()))throw Error('データが更新されました。閉じて開き直してください。');
    const next=CostCatalog.revise(costCatalog,{id:state.id,name:$('catalogName').value,category:$('catalogCategory').value,unit:$('catalogUnit').value,rate:$('catalogRate').value,note:$('catalogNote').value,archived:$('catalogArchived').checked},$('catalogReason').value,new Date().toISOString(),uid());
    const item=next.items.find(p=>p.id===state.id);catalogSaving=true;$('catalogSave').disabled=true;$('catalogCancel').disabled=true;
    if(!await confirmDataAction(`${item.name}\n参考単価：${item.rate} 円 / ${item.unit}\n\n過去の仕込みには反映しません。保存しますか？`,'参考単価を保存'))return;
    if(state.before!==JSON.stringify(window.fermentCloudData.getSnapshot()))throw Error('確認中にデータが更新されました。開き直してください。');
    await applyCostCatalog(next);maybeAutoBackup();if(window.fermentCloudSync)window.fermentCloudSync.queueSave();$('catalogDialog').close();
  }catch(error){$('catalogError').textContent=error.message||'保存できませんでした。';}
  finally{catalogSaving=false;$('catalogSave').disabled=false;$('catalogCancel').disabled=false;}
}
function closeCatalogEditor(){if(!catalogSaving)$('catalogDialog').close();}
function openFormExpenses(){
  if(!validateFormCostDraft())return;
  const draft=buildBatchFromForm(editingId);
  if(!draft.batchName){alert('先にバッチ名を入力してください。');return;}
  openExpenseEditor(draft.id,'form',draft);
}
function validateFormCostDraft(){
  if(formExpenseDraft?.expectedSnapshot&&formExpenseDraft.expectedSnapshot!==JSON.stringify(window.fermentCloudData.getSnapshot())){alert('消耗品の入力後にデータが更新されました。入力内容を控えて仕込み画面を開き直してください。古い費用での上書きを中止しました。');return false;}
  return true;
}
function addCatalogExpense(){
  if(!expenseEditorState||expenseSaving)return;
  try{
    const rows=readExpenseDraft(),id=$('expenseCatalogSelect').value,item=costCatalog.items.find(p=>p.id===id&&!p.archived);
    if(!item)throw Error('消耗品を選んでください。原材料管理で参考単価を登録できます。');
    if(rows.some(r=>r.pricing?.catalogId===id))throw Error('追加済みの消耗品です。既存の行の使用量を変更してください。');
    if(rows.length>=100)throw Error('費用は100行以内で登録してください。');
    rows.push(CostCatalog.expense(item,uid()));$('expenseReviewed').checked=false;renderExpenseDraft(rows);$('expenseError').textContent='';
  }catch(error){$('expenseError').textContent=error.message;}
}
function expensePricingText(row){return row.pricing?`参考：${row.pricing.rate} 円 / ${row.pricing.unit} × ${row.pricing.quantity===''?'未入力':row.pricing.quantity} ${row.pricing.unit}`:`手入力：${yenReference(row.amount===''?null:row.amount)} × ${row.percent}%`;}
document.addEventListener('click',event=>{const button=event.target.closest('[data-edit-catalog]');if(button)openCatalogEditor(button.dataset.editCatalog);});
