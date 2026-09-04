let processEditor=null,processSaving=false;
function processValuesText(row){
  return Object.entries(ProcessMeasurements.fields).filter(([key])=>row[key]!==''&&row[key]!=null).map(([key,f])=>`${f.label}：${row[key]}`).join(' ／ ')||'実測値なし';
}
function processMeasurementsHtml(batch){
  const rows=batch.processMeasurements??[];
  if(!Array.isArray(rows)||rows.some(r=>!r||!r.id))return '<p class="inv-unlinked-warning">保存済み実測記録の形式を確認してください。</p>';
  const button=`<button type="button" class="btn btn-primary" data-process-batch="${escapeHtml(batch.id)}">＋ 実測記録を追加</button>`;
  return button+`<div class="detail-list">${[...rows].sort((a,b)=>(a.date+' '+(a.time||'')).localeCompare(b.date+' '+(b.time||''))).map(r=>`<div class="expense-row"><strong>${escapeHtml(r.stage)}</strong><p>${escapeHtml(r.date)} ${escapeHtml(r.time||'')}<br>${escapeHtml(processValuesText(r))}</p>${r.note?`<p>${escapeHtml(r.note)}</p>`:''}<button type="button" class="btn" data-process-batch="${escapeHtml(batch.id)}" data-process-record="${escapeHtml(r.id)}">訂正する</button><details><summary>登録・訂正履歴</summary>${(Array.isArray(r.history)?r.history:[]).map(h=>`<p>${escapeHtml(h.recordedAt)} ／ ${escapeHtml(h.reason)}<br>変更前：${h.before?escapeHtml(h.before.stage+' '+h.before.date+' '+(h.before.time||'')+' '+processValuesText(h.before)+' '+(h.before.note||'')):'新規'}<br>変更後：${h.after?escapeHtml(h.after.stage+' '+h.after.date+' '+(h.after.time||'')+' '+processValuesText(h.after)+' '+(h.after.note||'')):'—'}</p>`).join('')}</details></div>`).join('')||'<p>まだ実測記録がありません。糖化・煮沸・追加工程の測定結果を登録できます。</p>'}</div>`;
}
function renderProcessMeasurements(batch){
  if($('sch_measurements'))$('sch_measurements').innerHTML=processMeasurementsHtml(batch);
}
function openProcessEditor(batchId,recordId){
  if(processSaving||$('processDialog').open)return;
  const batch=batches.find(b=>b.id===batchId);if(!batch)return;
  const rows=batch.processMeasurements??[];
  if(!Array.isArray(rows)||rows.some(r=>!r||!r.id)){alert('保存済み実測記録の形式を確認してください。');return;}
  const row=recordId?rows.find(r=>r.id===recordId):null;if(recordId&&!row)return;
  processEditor={batchId,recordId:recordId||null,before:JSON.stringify(window.fermentCloudData.getSnapshot())};
  $('processBatch').textContent=batch.batchName||'名称未設定';$('processError').textContent='';
  $('processStage').value=row?.stage||'';$('processDate').value=row?.date||todayDateValue();$('processDate').max=todayDateValue();$('processTime').value=row?.time||'';$('processNote').value=row?.note||'';$('processReason').value='';
  const labels=[...computeScheduleSteps(batch).map(s=>s.label),...(batch.customScheduleSteps||[]).map(s=>s.label),...rows.map(r=>r.stage)].filter(Boolean);
  $('processStages').innerHTML=[...new Set(labels)].map(s=>`<option value="${escapeHtml(s)}"></option>`).join('');
  $('processFields').innerHTML=Object.entries(ProcessMeasurements.fields).map(([key,f])=>`<div class="field"><label for="pm_${key}">${f.label}（任意）</label><input id="pm_${key}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${escapeHtml(row?.[key]??'')}" placeholder="未入力"></div>`).join('');
  enhanceNumberInputs($('processFields'));$('processDialog').showModal();$('processStage').focus();
}
function closeProcessEditor(){if(!processSaving)$('processDialog').close();}
async function saveProcessEditor(){
  if(!processEditor||processSaving)return;
  const state=processEditor;$('processError').textContent='';
  try{
    const snapshot=()=>JSON.stringify(window.fermentCloudData.getSnapshot());
    if(snapshot()!==state.before)throw Error('入力中にデータが更新されました。閉じてから開き直してください。');
    const batch=batches.find(b=>b.id===state.batchId);if(!batch)throw Error('対象の仕込みが見つかりません。');
    const input={stage:$('processStage').value,date:$('processDate').value,time:$('processTime').value,note:$('processNote').value,...Object.fromEntries(Object.keys(ProcessMeasurements.fields).map(k=>[k,$('pm_'+k).value]))};
    const next=ProcessMeasurements.revise(batch,state.recordId,input,$('processReason').value,todayDateValue(),uid(),new Date().toISOString());
    processSaving=true;$('processSave').disabled=true;$('processCancel').disabled=true;
    if(!await confirmDataAction(`${batch.batchName||''}\n${input.stage}\n${input.date} ${input.time}\n${processValuesText(input)}\n\n実測記録を保存します。OG・発酵記録・在庫・タンク残量は自動変更しません。`,'実測記録を保存'))return;
    if(snapshot()!==state.before)throw Error('確認中にデータが更新されました。開き直してください。');
    const previous=batches,replacement=batches.map(b=>b.id===next.id?next:b);batches=replacement;
    try{await window.storage.set('wangan-batches',JSON.stringify(replacement),false);}catch(error){if(batches===replacement)batches=previous;throw Error('端末に保存できませんでした。空き容量を確認してください。');}
    maybeAutoBackup();if(window.fermentCloudSync)window.fermentCloudSync.queueSave();
    $('processDialog').close();
    // Update only the log, preserving unsaved custom schedule rows and timing fields.
    if(currentScheduleBatch()?.id===next.id)renderProcessMeasurements(next);
    if(!$('viewDetail').hidden&&$('viewDetail').dataset.id===next.id)openDetail(next.id);
  }catch(error){$('processError').textContent=error.message;}
  finally{processSaving=false;$('processSave').disabled=false;$('processCancel').disabled=false;}
}
function exportProcessMeasurementsCSV(){
  const rows=[['バッチID','バッチ名','記録ID','工程','測定日','測定時刻','比重SG','pH','温度℃','液量L','メモ','登録・訂正履歴JSON']];
  for(const b of exportableBatches()){
    if(b.processMeasurements!=null&&!Array.isArray(b.processMeasurements)){alert('実測記録の形式が不正です。バックアップを確認してください。');return;}
    for(const r of b.processMeasurements||[])if(r)rows.push([b.id,b.batchName,r.id,r.stage,r.date,r.time,r.gravity,r.ph,r.temperature,r.volume,r.note,JSON.stringify(r.history||[])]);
  }
  if(rows.length===1){alert('書き出せる工程実測記録がありません。');return;}
  downloadBlob('\uFEFF'+rows.map(row=>row.map(costDetailCSVCell).join(',')).join('\r\n'),`工程実測記録_${todayDateValue()}.csv`,'text/csv;charset=utf-8');
}
document.addEventListener('click',event=>{const button=event.target.closest('[data-process-batch]');if(button)openProcessEditor(button.dataset.processBatch,button.dataset.processRecord);});
