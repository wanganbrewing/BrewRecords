function yenReference(value){
  return value==null||!Number.isFinite(Number(value))?'未計算':'¥'+Number(value).toLocaleString('ja-JP',{maximumFractionDigits:2});
}
function refreshValuationControls(){
  $('valuationAuto').checked=valuationBook.autoEnabled;
  const selected=$('valuationSaved').value;
  $('valuationSaved').innerHTML='<option value="">選択してください</option>'+[...valuationBook.reports].reverse().map(r=>`<option value="${escapeHtml(r.id)}">${escapeHtml(r.month)} ／ ${escapeHtml(r.createdAt)}${r.automatic?' 自動':''}</option>`).join('');
  $('valuationSaved').value=selected;
}
async function openValuationPanel(){
  if(!$('valuationMonth').value)$('valuationMonth').value=InventoryCosting.previousMonth(todayDateValue());
  refreshValuationControls();renderValuation();
  await autoSaveValuations();refreshValuationControls();
}
function valuationTableHtml(report){
return `<table class="inventory-table"><caption>${escapeHtml(report.cutoff)}時点の棚卸参考額</caption><thead><tr>${['品目／メーカー・ロット','残量','単位','参考単価(円)','参考額(円)','確認事項'].map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${report.rows.map(r=>`<tr><td>${escapeHtml(r.name)}${inventoryMetaHtml(r)}</td><td>${escapeHtml(r.quantity)}</td><td>${escapeHtml(r.unit)}</td><td>${r.quantity===0&&r.value===0?'—':yenReference(r.unitCost)}</td><td>${yenReference(r.value)}</td><td>${escapeHtml(r.reason||'')}</td></tr>`).join('')||'<tr><td colspan="6">原材料が登録されていません。</td></tr>'}</tbody></table>`;
}
function renderValuation(){
  $('valuationError').textContent='';
  try{
    if(valuationReadError)throw Error(valuationReadError);
    const month=$('valuationMonth').value,end=InventoryCosting.monthEnd(month),today=todayDateValue();
    if(month>today.slice(0,7))throw Error('未来の月は集計できません。');
    const cutoff=end>today?today:end,calc=InventoryCosting.calculate(inventory,cutoff);
    valuationShown={...calc,month,source:'preview',inventorySource:JSON.stringify(inventory)};
    $('valuationSaved').value='';$('valuationResult').innerHTML=valuationTableHtml(calc);
    $('valuationStatus').textContent=`再計算：${cutoff}時点 ／ ${calc.unknown?'計算できた分の小計':'合計'} ${yenReference(calc.subtotal)} ／ 未計算 ${calc.unknown}品目${end>=today?'。当月は途中経過です。月末を過ぎてから保存できます。':''}`;
    $('valuationSave').disabled=end>=today||!calc.rows.length;
  }catch(error){valuationShown=null;$('valuationResult').innerHTML='';$('valuationStatus').textContent='';$('valuationError').textContent=error.message;$('valuationSave').disabled=true;}
}
function showSavedValuation(id){
  const report=valuationBook.reports.find(r=>r.id===id);if(!report)return;
  valuationShown={...report,source:'saved'};$('valuationMonth').value=report.month;$('valuationError').textContent='';
  $('valuationResult').innerHTML=valuationTableHtml(report);
  $('valuationStatus').textContent=`保存済み：${report.createdAt} ／ ${report.unknown?'計算できた分の小計':'合計'} ${yenReference(report.subtotal)} ／ 未計算 ${report.unknown}品目 ／ ${report.reason}。現在の履歴を再計算した値ではありません。`;
  $('valuationSave').disabled=true;
}
async function persistValuationBook(next,expected){
  if(JSON.stringify(window.fermentCloudData.getSnapshot())!==expected)throw Error('データが更新されました。再計算して確認してください。');
  const before=valuationBook;valuationBook=InventoryCosting.normalizeBook(next);const replacement=valuationBook;
  try{await window.storage.set('wangan-valuations',JSON.stringify(valuationBook),false);}
  catch(error){if(valuationBook===replacement)valuationBook=before;throw Error('月末結果を保存できませんでした。端末の空き容量を確認してください。');}
  maybeAutoBackup();if(window.fermentCloudSync)window.fermentCloudSync.queueSave();
}
async function saveValuationReport(){
  if(valuationBusy)return;$('valuationError').textContent='';
  try{
    if(!valuationShown||valuationShown.source!=='preview')throw Error('現在の履歴から再計算してから保存してください。');
    if(valuationShown.inventorySource!==JSON.stringify(inventory)){renderValuation();throw Error('履歴が変わったため再計算しました。内容を確認してもう一度保存してください。');}
    const reason=$('valuationReason').value.trim();if(!reason||reason.length>300)throw Error('保存理由を300文字以内で入力してください。');
    const expected=JSON.stringify(window.fermentCloudData.getSnapshot());
    const report=InventoryCosting.makeReport(inventory,$('valuationMonth').value,todayDateValue(),uid(),new Date().toISOString(),reason);
    const last=[...valuationBook.reports].reverse().find(r=>r.month===report.month);
    if(last&&last.method===report.method&&JSON.stringify(last.rows)===JSON.stringify(report.rows))throw Error('同じ計算結果が保存済みです。「保存済みの結果」から確認できます。');
    valuationBusy=true;
    if(!await confirmDataAction(`${report.month}の月末参考額を保存します。\n${report.unknown?'計算できた分の小計':'合計'}：${yenReference(report.subtotal)}\n未計算：${report.unknown}品目\n理由：${reason}\n既存の保存結果は上書きしません。`,'月末結果を保存'))return;
    await persistValuationBook({...valuationBook,reports:[...valuationBook.reports,report]},expected);
    refreshValuationControls();$('valuationSaved').value=report.id;showSavedValuation(report.id);
  }catch(error){$('valuationError').textContent=error.message;}
  finally{valuationBusy=false;}
}
async function setValuationAuto(enabled){
  if(valuationBusy){refreshValuationControls();return;}valuationBusy=true;
  try{
    const expected=JSON.stringify(window.fermentCloudData.getSnapshot());
    const next={...valuationBook,autoEnabled:enabled,startMonth:enabled?todayDateValue().slice(0,7):valuationBook.startMonth};
    await persistValuationBook(next,expected);$('valuationError').textContent='';
    $('valuationStatus').textContent=enabled?`${next.startMonth}分から、翌月以降にアプリを開いた際に未保存の月末結果を保存します。`:'月末結果の自動保存を停止しました。保存済みの結果は残ります。';
  }catch(error){$('valuationError').textContent=error.message;}
  finally{valuationBusy=false;refreshValuationControls();}
}
async function autoSaveValuations(){
  if(valuationBusy||!valuationBook.autoEnabled||!inventory.length)return;valuationBusy=true;
  try{
    const today=todayDateValue(),last=InventoryCosting.previousMonth(today);let month=valuationBook.startMonth;
    InventoryCosting.monthEnd(month);
    const expected=JSON.stringify(window.fermentCloudData.getSnapshot()),reports=[...valuationBook.reports];
    for(;month<=last;){
      if(!reports.some(r=>r.month===month))reports.push(InventoryCosting.makeReport(inventory,month,today,uid(),new Date().toISOString(),'アプリ起動時の履歴から自動集計（要確認）',true));
      const end=InventoryCosting.monthEnd(month),next=new Date(end+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);month=next.toISOString().slice(0,7);
    }
    if(reports.length!==valuationBook.reports.length)await persistValuationBook({...valuationBook,reports},expected);
  }catch(error){$('valuationError').textContent='自動保存を完了できませんでした：'+error.message;}
  finally{valuationBusy=false;}
}
function renderBatchMaterialCost(batch){
  const calc=InventoryCosting.calculate(inventory,todayDateValue()),cost=InventoryCosting.batchCost(batch,calc,getUnlinkedMaterials(batch));
  return `<details class="section" id="batchCostPanel"><summary class="section-title">原価（参考）</summary>${renderExpenseSummary(batch,cost)}<h3>原材料費の内訳</h3><p class="inventory-table-note">消費記録の数量と消費時点の平均単価で計算します。未連携・未消費・数量不一致・金額未入力は未計算です。後の入荷訂正で再計算されます。</p>${cost.missing.length?`<p class="inv-unlinked-warning">要確認：${cost.missing.map(escapeHtml).join('、')}</p>`:''}<div class="detail-list">${cost.uses.map(r=>`<div class="row"><div>${escapeHtml(inventoryItemLabel(r))}<br>${escapeHtml(r.date)} ／ ${escapeHtml(r.amount)} ${escapeHtml(r.unit)}${r.reason?'<br>'+escapeHtml(r.reason):''}</div><span>${yenReference(r.value)}</span></div>`).join('')||'<p>消費記録がありません。仕込み側で在庫と連携し、「在庫から消費を記録」を行ってください。</p>'}</div></details>`;
}
function exportValuationCSV(){
  if(!valuationShown){openInventoryView();$('valuationPanel').open=true;alert('月末棚卸額を開きました。対象月を再計算するか保存済みの結果を選び、もう一度書き出してください。');return;}
  const r=valuationShown;
  if(r.source==='preview'&&r.inventorySource!==JSON.stringify(inventory)){alert('集計後に履歴が変わりました。再計算してから書き出してください。');return;}
  const rows=[['対象月','集計日','保存状態','保存日時','計算方法','品目ID','分類','品目名','メーカー','ロット','残量','単位','参考単価','参考額','未計算理由']];
  r.rows.forEach(i=>rows.push([r.month,r.cutoff,r.source==='saved'?'保存済み':'再計算',r.createdAt||'',r.method,i.itemId,i.category,i.name,i.manufacturer,i.lotCode,i.quantity,i.unit,i.unitCost??'',i.value??'',i.reason]));
  downloadBlob('\uFEFF'+rows.map(row=>row.map(csvEscape).join(',')).join('\r\n'),`月末棚卸参考額_${r.month}.csv`,'text/csv;charset=utf-8');
}
