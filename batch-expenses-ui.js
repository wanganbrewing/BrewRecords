let expenseEditorState=null,expenseSaving=false;
function readExpenseDraft(){
  return [...$('expenseRows').querySelectorAll('[data-expense-row]')].map(row=>{
    const pricing=JSON.parse(row.dataset.expensePricing||'null');if(pricing)pricing.quantity=row.querySelector('.extra-quantity').value;
    return {id:row.dataset.expenseRow,category:row.querySelector('.extra-category').value,name:row.querySelector('.extra-name').value,date:row.querySelector('.extra-date').value,amount:row.querySelector('.extra-amount')?.value||'',percent:row.querySelector('.extra-percent')?.value||100,reference:row.querySelector('.extra-reference').value,note:row.querySelector('.extra-note').value,...(pricing?{pricing}:{})};
  });
}
function expenseFieldsHtml(row,index){
  const id='expense-field-'+index;
  return `<div class="expense-row" data-expense-row="${escapeHtml(row.id)}" data-expense-pricing="${escapeHtml(JSON.stringify(row.pricing||null))}">
    <div class="grid2"><div class="field"><label for="${id}-category">分類 ${index+1}</label><select id="${id}-category" class="extra-category" ${row.pricing?'disabled':''}>${Object.entries(BatchExpenses.categories).map(([key,label])=>`<option value="${key}" ${row.category===key?'selected':''}>${label}</option>`).join('')}</select></div><div class="field"><label for="${id}-name">内容 ${index+1}</label><input id="${id}-name" class="extra-name" ${row.pricing?'readonly':''} type="text" maxlength="120" value="${escapeHtml(row.name||'')}" placeholder="例：8月分の電気代"></div></div>
    ${row.pricing?`<p class="inventory-table-note">参考単価：${escapeHtml(row.pricing.rate)} 円 / ${escapeHtml(row.pricing.unit)}（追加時点の単価を保持）</p><div class="field"><label for="${id}-quantity">使用量 ${index+1}（${escapeHtml(row.pricing.unit)}）</label><input id="${id}-quantity" class="extra-quantity" type="number" min="0" max="1000000000" step="0.0001" value="${escapeHtml(row.pricing.quantity)}" placeholder="未入力"></div>`:`<div class="grid2"><div class="field"><label for="${id}-amount">元の金額（円） ${index+1}</label><input id="${id}-amount" class="extra-amount" type="number" min="0" max="1000000000" step="0.01" value="${escapeHtml(row.amount??'')}" placeholder="未入力"></div><div class="field"><label for="${id}-percent">割り当てる割合（%） ${index+1}</label><input id="${id}-percent" class="extra-percent" type="number" min="0" max="100" step="0.01" value="${escapeHtml(row.percent??100)}"></div></div>`}
    <div class="grid2"><div class="field"><label for="${id}-date">日付（任意） ${index+1}</label><input id="${id}-date" class="extra-date" type="date" max="${todayDateValue()}" value="${escapeHtml(row.date||'')}"></div><div class="field"><label for="${id}-reference">請求書・伝票番号（任意） ${index+1}</label><input id="${id}-reference" class="extra-reference" type="text" maxlength="120" value="${escapeHtml(row.reference||'')}"></div></div>
    <div class="field"><label for="${id}-note">配分の根拠・メモ ${index+1}</label><input id="${id}-note" class="extra-note" type="text" maxlength="300" value="${escapeHtml(row.note||'')}" placeholder="例：月5仕込みのうち1回分"></div>
    <button type="button" class="btn btn-ghost" data-remove-expense="${escapeHtml(row.id)}">この行を削除</button>
  </div>`;
}
function renderExpenseDraft(rows){
  $('expenseRows').innerHTML=rows.map(expenseFieldsHtml).join('')||'<p class="inventory-table-note">追加費用はまだ登録されていません。</p>';
  $('expenseUndo').hidden=!expenseEditorState.removed.length;
  updateExpensePreview();
}
function updateExpensePreview(){
  if(!expenseEditorState)return;
  const sum=BatchExpenses.summarize(readExpenseDraft(),todayDateValue());
  $('expensePreview').textContent=`この仕込みへの割当額：${yenReference(sum.subtotal)} ／ 未計算 ${sum.unknown}行${$('expenseReviewed').checked?' ／ 入力確認済み':' ／ 入力は未確認'}`;
}
function openExpenseEditor(batchId,origin='detail',draft=null){
  if($('expenseDialog').open||expenseSaving)return;
  const batch=draft||batches.find(b=>b.id===batchId);if(!batch)return;
  if(batch.otherCosts!=null&&!Array.isArray(batch.otherCosts)){alert('保存された費用の形式が不正です。バックアップを確認してください。');return;}
  expenseEditorState={batchId,origin,batchSnapshot:batch,before:JSON.stringify(window.fermentCloudData.getSnapshot()),removed:[]};
  $('expenseCatalogSelect').innerHTML='<option value="">消耗品を選択</option>'+costCatalog.items.filter(p=>!p.archived).map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)}（${p.rate} 円 / ${escapeHtml(p.unit)}）</option>`).join('');
  $('expenseBatchName').textContent=batch.batchName||'名称未設定';$('expenseError').textContent='';$('expenseReason').value='';$('expenseReviewed').checked=batch.otherCostsReviewed===true;
  renderExpenseDraft(JSON.parse(JSON.stringify(batch.otherCosts||[])));
  const dialog=$('expenseDialog');
  if(!dialog.dataset.expenseReady){dialog.dataset.expenseReady='1';dialog.addEventListener('cancel',e=>{if(expenseSaving)e.preventDefault();});dialog.addEventListener('close',()=>{expenseEditorState=null;});$('expenseRows').addEventListener('input',updateExpensePreview);$('expenseRows').addEventListener('change',updateExpensePreview);}
  dialog.showModal();$('expenseTitle').focus({preventScroll:true});dialog.scrollTop=0;
}
function addExpenseDraft(){
  if(!expenseEditorState||expenseSaving)return;
  const rows=readExpenseDraft();if(rows.length>=100){$('expenseError').textContent='費用は100行以内で登録してください。';return;}
  rows.push({id:uid(),category:'cleaning',name:'',date:'',amount:'',percent:100,reference:'',note:''});$('expenseReviewed').checked=false;renderExpenseDraft(rows);
}
function removeExpenseDraft(id){
  if(!expenseEditorState||expenseSaving)return;
  const rows=readExpenseDraft(),index=rows.findIndex(r=>r.id===id);if(index<0)return;
  expenseEditorState.removed.push({index,row:rows[index]});rows.splice(index,1);$('expenseReviewed').checked=false;renderExpenseDraft(rows);
}
function undoExpenseRemoval(){
  if(!expenseEditorState||expenseSaving)return;
  const removed=expenseEditorState.removed.pop();if(!removed)return;
  const rows=readExpenseDraft();rows.splice(Math.min(removed.index,rows.length),0,removed.row);$('expenseReviewed').checked=false;renderExpenseDraft(rows);
}
function closeExpenseEditor(){if(!expenseSaving)$('expenseDialog').close();}
async function persistBatchExpenses(next,expected){
  if(expected!==JSON.stringify(window.fermentCloudData.getSnapshot()))throw Error('データが更新されました。閉じてから開き直して確認してください。');
  if(!batches.some(b=>b.id===next.id))throw Error('対象の仕込みが見つかりません。');
  const previous=batches,replacement=batches.map(b=>b.id===next.id?next:b);batches=replacement;
  try{await window.storage.set('wangan-batches',JSON.stringify(replacement),false);}
  catch(error){if(batches===replacement)batches=previous;throw Error('端末に保存できませんでした。空き容量を確認してください。');}
  maybeAutoBackup();if(window.fermentCloudSync)window.fermentCloudSync.queueSave();
}
async function saveExpenseEditor(){
  if(!expenseEditorState||expenseSaving)return;
  $('expenseError').textContent='';
  const state=expenseEditorState;
  try{
    const batch=state.origin==='form'?state.batchSnapshot:batches.find(b=>b.id===state.batchId);
    if(!batch||state.before!==JSON.stringify(window.fermentCloudData.getSnapshot()))throw Error('入力中にデータが変わりました。閉じてから開き直してください。');
    const next=BatchExpenses.revision(batch,readExpenseDraft(),$('expenseReviewed').checked,$('expenseReason').value,todayDateValue(),uid(),new Date().toISOString());
    const sum=BatchExpenses.summarize(next.otherCosts,todayDateValue());
    expenseSaving=true;$('expenseSave').disabled=true;$('expenseCancel').disabled=true;
    if(!await confirmDataAction(`${batch.batchName||''}\nその他の原価：${yenReference(sum.subtotal)}\n未計算：${sum.unknown}行\n入力確認：${next.otherCostsReviewed?'済み':'未確認'}\n理由：${$('expenseReason').value.trim()}\n\n${state.origin==='form'?'仕込みの入力へ反映します。最後に仕込み画面の「保存する」が必要です。':'保存しますか？'}変更前後は履歴に残ります。`,state.origin==='form'?'仕込みへ反映':'原価を保存'))return;
    if(state.origin==='form'){
      if(state.before!==JSON.stringify(window.fermentCloudData.getSnapshot()))throw Error('確認中にデータが更新されました。開き直してください。');
      formExpenseDraft={otherCosts:next.otherCosts,otherCostsReviewed:next.otherCostsReviewed,otherCostHistory:next.otherCostHistory,expectedSnapshot:state.before};
      $('formCostStatus').textContent=`消耗品・その他費用：${yenReference(sum.subtotal)}（未保存）。仕込み画面の「保存する」で確定してください。`;
      if(typeof markEditorDirty==='function')markEditorDirty();
    }else await persistBatchExpenses(next,state.before);
    $('expenseDialog').close();if(state.origin!=='form')openDetail(next.id);
    const panel=$('batchCostPanel');if(panel)panel.open=true;
  }catch(error){$('expenseError').textContent=error.message;}
  finally{expenseSaving=false;$('expenseSave').disabled=false;$('expenseCancel').disabled=false;}
}
function costHistoryHtml(batch){
  const history=batch.otherCostHistory||[];if(!history.length)return '';
  return `<details><summary>その他の原価の変更履歴（${history.length}件）</summary>${[...history].reverse().map(h=>`<div class="expense-row"><p>${escapeHtml(h.recordedAt)} ／ ${escapeHtml(h.reason)}</p><p>入力確認：${h.before?.reviewed?'済み':'未確認'} → ${h.after?.reviewed?'済み':'未確認'}</p>${[['変更前',h.before],['変更後',h.after]].map(([label,state])=>`<strong>${label}</strong><ul>${(state?.rows||[]).map(r=>`<li>${escapeHtml(BatchExpenses.categories[r.category]||r.category)}：${escapeHtml(r.name)} ／ 元の金額 ${escapeHtml(expensePricingText(r))} ／ ${escapeHtml(r.date||'日付なし')} ／ ${escapeHtml(r.reference||'')} ／ ${escapeHtml(r.note||'')}</li>`).join('')||'<li>追加費用なし</li>'}</ul>`).join('')}</div>`).join('')}</details>`;
}
function renderExpenseSummary(batch,material){
  const sum=BatchExpenses.combined(batch,material,todayDateValue());
  return `<div class="cost-summary"><div>原材料費${material.complete?'':'（計算できた分）'}<strong>${yenReference(material.subtotal)}</strong></div><div>その他の原価${sum.extra.unknown?'（計算できた分）':''}<strong>${yenReference(sum.extra.subtotal)}</strong></div><div>${sum.complete?'登録範囲の原価合計':'計算できた分の小計'}<strong>${yenReference(sum.total)}</strong>${sum.complete?'':'未確定'}</div></div>
    <p class="inventory-table-note">${sum.perLiter===null?'1Lあたり：未計算（入力の確認・原材料費・バッチサイズを確認してください）':`登録バッチサイズ ${escapeHtml(batch.batchSize)} L換算：${yenReference(sum.perLiter)} / L（実際の製品歩留まりは未反映）`}</p>
    <p class="inventory-table-note">原材料費は消費記録から計算します。その他は下の入力で割り当てた費用のみです。参考単価からの概算と手入力の費用を含みます。未登録の費用は合計に含まれません。会計・申告用の確定原価ではありません。</p>
    ${batch.otherCostsReviewed!==true?'<p class="inv-unlinked-warning">その他の費用が入力済みか未確認です。追加費用がない場合も入力画面で確認してください。</p>':''}${sum.extra.unknown?`<p class="inv-unlinked-warning">その他の原価：未計算 ${sum.extra.unknown}行。${escapeHtml(sum.extra.error||'')}</p>`:''}
    <button type="button" class="btn btn-primary" data-expense-batch="${escapeHtml(batch.id)}">その他の原価を入力・訂正</button>
    <button type="button" class="btn" data-cost-detail-export="${escapeHtml(batch.id)}">この仕込みの原価明細CSV</button>
    <details><summary>その他の原価の内訳</summary><div class="detail-list">${sum.extra.rows.map(r=>`<div class="row"><div>${escapeHtml(BatchExpenses.categories[r.category]||r.category||'分類未設定')}：${escapeHtml(r.name||'内容未入力')}<br>${escapeHtml(expensePricingText(r))}${r.reference?'<br>伝票：'+escapeHtml(r.reference):''}${r.note?'<br>'+escapeHtml(r.note):''}${r.reason?'<br>'+escapeHtml(r.reason):''}</div><span>${yenReference(r.value)}</span></div>`).join('')||'<p>追加費用の登録はありません。</p>'}</div></details>${costHistoryHtml(batch)}`;
}
function exportBatchCostsCSV(){
  const calc=InventoryCosting.calculate(inventory,todayDateValue());
  const rows=[['バッチID','バッチ名','原材料費(計算済分)','原材料費の計算完了','その他原価(計算済分)','その他原価の未計算行数','その他原価の入力確認','合計または小計','計算状態','登録バッチサイズL','登録量1Lあたり参考額','費用明細JSON','変更履歴JSON','参考単価による概算費用']];
  exportableBatches().forEach(b=>{const material=InventoryCosting.batchCost(b,calc,getUnlinkedMaterials(b)),s=BatchExpenses.combined(b,material,todayDateValue());rows.push([b.id,b.batchName,material.subtotal,material.complete?'済み':'未完了',s.extra.subtotal,s.extra.unknown,b.otherCostsReviewed===true?'済み':'未確認',s.total,s.complete?'登録範囲の合計':'計算できた分の小計（未確定）',b.batchSize,s.perLiter??'',JSON.stringify(b.otherCosts||[]),JSON.stringify(b.otherCostHistory||[]),BatchExpenses.round(s.extra.rows.filter(r=>r.pricing).reduce((sum,r)=>sum+(r.value??0),0))]);});
  const safeCell=value=>csvEscape(typeof value==='string'&&/^[\s]*[=+\-@]/.test(value)?"'"+value:value);
  downloadBlob('\uFEFF'+rows.map(row=>row.map(safeCell).join(',')).join('\r\n'),`仕込み別原価参考額_${todayDateValue()}.csv`,'text/csv;charset=utf-8');
}
// Detail-only output: do not repeat batch totals on each line (which would double count in spreadsheets).
function batchCostDetailRows(selected,calculation,day){
  const columns=['集計日','バッチID','バッチ名','バッチ全体の計算状態','その他費用の入力確認','区分','明細ID／品目ID','分類','品目・内容','メーカー','ロット番号','日付','数量／使用量','単位','単価(円)','元の金額(円)','配分率(%)','明細参考額(円)','明細の計算状態','未計算・確認事項','伝票番号','メモ','参考単価版'];
  const rows=[columns];
  for(const b of selected){
    const material=InventoryCosting.batchCost(b,calculation,getUnlinkedMaterials(b));
    const sum=BatchExpenses.combined(b,material,day);
    const prefix=[day,b.id,b.batchName,sum.complete?'登録範囲の計算完了':'未確定',b.otherCostsReviewed===true?'済み':'未確認'];
    const add=detail=>rows.push([...prefix,...detail]);
    for(const use of material.uses){
      const item=calculation.rows.find(r=>r.itemId===use.itemId);
      const known=Number.isFinite(use.value);
      add(['原材料',use.itemId,({fermentable:'モルト',malt:'モルト',hop:'ホップ',yeast:'酵母',adjunct:'副原料'})[item?.category]||item?.category||'',use.name,use.manufacturer,use.lotCode,use.date,use.amount,use.unit,known&&use.amount>0?use.value/use.amount:'','','',known?BatchExpenses.round(use.value):'',known?'計算済み':'未計算',use.reason||'','','消費時点の移動平均単価。明細の端数により合計CSVと差が生じる場合があります。','']);
    }
    if(!material.complete){
      add(['確認事項','','原材料','原材料費の確認','','','','','','','','','','未確定',[...material.missing,...(!material.uses.length?['消費記録がありません']:[])].join('／')||'未計算の消費記録があります','','金額空欄は0円ではありません。','']);
    }
    for(const r of sum.extra.rows){
      const known=Number.isFinite(r.value),p=r.pricing;
      add([p?'消耗品参考費用':'手入力費用',r.id,BatchExpenses.categories[r.category]||r.category||'',r.name||'内容未入力','','',r.date||'',p?.quantity??'',p?.unit||'',p?.rate??'',p?'':r.amount??'',p?'':r.percent??'',known?r.value:'',known?'計算済み':'未計算',r.reason||'',r.reference||'',r.note||'',p?.revision??'']);
    }
    if(sum.extra.error)add(['確認事項','','その他費用','費用データの確認','','','','','','','','','','未計算',sum.extra.error,'','','']);
    if(!sum.extra.rows.length)add(['確認事項','','その他費用','追加費用の登録なし','','','','','','','','','','確認事項',b.otherCostsReviewed===true?'追加費用なしを確認済み':'費用の入力有無が未確認です','','','']);
  }
  return rows;
}
function costDetailCSVCell(value){
  let text=String(value??'');
  if(typeof value==='string'&&/^[\s\u0000-\u001f]*[=+\-@]/.test(text))text="'"+text;
  return /[",\r\n]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
function exportBatchCostDetailsCSV(batchId){
  const selected=exportableBatches().filter(b=>batchId==null||b.id===batchId);
  if(!selected.length){alert('書き出せる仕込み記録がありません。');return;}
  const day=todayDateValue(),calculation=InventoryCosting.calculate(inventory,day);
  const rows=batchCostDetailRows(selected,calculation,day);
  downloadBlob('\uFEFF'+rows.map(row=>row.map(costDetailCSVCell).join(',')).join('\r\n'),`原価明細参考額_${batchId==null?'全仕込み':'選択した仕込み'}_${day}.csv`,'text/csv;charset=utf-8');
}
document.addEventListener('click',event=>{const edit=event.target.closest('[data-expense-batch]'),remove=event.target.closest('[data-remove-expense]'),detail=event.target.closest('[data-cost-detail-export]');if(edit)openExpenseEditor(edit.dataset.expenseBatch);else if(remove)removeExpenseDraft(remove.dataset.removeExpense);else if(detail)exportBatchCostDetailsCSV(detail.dataset.costDetailExport);});
