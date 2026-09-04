let brewTargetDraft=null,targetSheetBefore='',targetSheetSnapshot='',targetSheetReadOnly=false,targetSheetDirty=false,targetSheetFocus=null;
const TARGET_BINDINGS=[
  ['batchName','バッチ名','text'],['style','スタイル','text'],['brewDate','仕込み予定日','date'],['brewer','担当者','text'],['batchSize','予定仕込み量','number','L'],
  ['waterVolume','糖化用水 合計（仕込み水量へ連動）','number','L'],['targetOG','目標OG','number','SG'],['mashTemp','目標糖化温度','number','℃'],['mashTime','目標糖化時間','number','分'],['boilTime','目標煮沸時間','number','分'],
  ['yeast','酵母名','text'],['yeastAmount','酵母の予定使用量','number',''],['yeastUnit','酵母の単位','text'],
  ['mCa','Ca²⁺','number','ppm'],['mMg','Mg²⁺','number','ppm'],['mNa','Na⁺','number','ppm'],['mCl','Cl⁻','number','ppm'],['mSO4','SO₄²⁻','number','ppm'],['mHCO3','HCO₃⁻','number','ppm']
];
const TARGET_ROW_LABELS={fermentable:'モルト',hop:'ホップ',adjunct:'副原料',mineral:'水質調整剤'};
function targetEsc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function resetBrewTargetDraft(){brewTargetDraft=null;}
function loadBrewTargetDraft(b){brewTargetDraft=b.brewTargets==null?null:JSON.parse(JSON.stringify(b.brewTargets));}
function collectBrewTargets(saved){const p=brewTargetDraft??saved?.brewTargets;if(p==null)return undefined;const water=document.getElementById?.('f_waterVolume');return water?BrewTargets.waterPlan(p,water.value):JSON.parse(JSON.stringify(p));}
function collectBrewTargetRowMetadata(row){
  if(!row.dataset.brewTargetMeta)return {};
  const amount=row.querySelector('.rf-amount,.rh-amount,.ra-amount,.rm-amount')?.value??'';
  return {targetMeta:BrewTargets.rowMeta({amount,targetMeta:JSON.parse(row.dataset.brewTargetMeta)})};
}
function scaleBrewTargetCopy(copy,ratio){
  if(copy.brewTargets)copy.brewTargets=BrewTargets.scalePlan(copy.brewTargets,ratio);
  for(const [key] of Object.values(BrewTargets.rowTypes))for(const row of copy[key]||[]){
    if(!row.targetMeta)continue;
    const meta=BrewTargets.scaleMeta(row.targetMeta,ratio);
    if(meta.batch2!=null&&meta.batch2!==''&&row.amount!==''){
      meta.batch2=String(Math.min(Number(meta.batch2),Number(row.amount)));
      meta.batch1=String(Math.round((Number(row.amount)-Number(meta.batch2))*1e6)/1e6);
    }else meta.batch1=row.amount;
    row.targetMeta=meta;
  }
}
function validateBrewTargetsForm(){
  try{if(brewTargetDraft!=null)BrewTargets.normalize(brewTargetDraft);return true;}
  catch(e){alert(e.message);return false;}
}
function targetControl(attrs,value,type='text'){
  // Explicit labels remain visible; native numeric input is kept compact in the PC table.
  return `<input ${attrs} type="${type==='number'?'text':type}" ${type==='number'?'inputmode="decimal"':''} value="${targetEsc(value)}" maxlength="1000">`;
}
function targetField(def,value,scope='extra'){
  const [key,label,type,unit]=def,id=`target-${scope}-${key}`;
  return `<div class="target-field"><label for="${id}">${targetEsc(label)}${unit?'（'+targetEsc(unit)+'）':''}</label>${targetControl(`id="${id}" data-${scope}="${key}"`,value,type)}</div>`;
}
function targetBound(key,b){return targetField(TARGET_BINDINGS.find(x=>x[0]===key),b[key]??'','bound');}
function targetExtra(key,plan){return targetField(BrewTargets.fields.find(x=>x[0]===key),plan.fields[key]??'');}
function targetSection(title,content){return `<section class="target-section"><h3>${title}</h3>${content}</section>`;}
function targetOptions(type,selected){
  const list=type==='mineral'?[]:inventory.filter(i=>i.category===type);
  return `<option value="">在庫と未連携</option>`+list.map(i=>`<option value="${targetEsc(i.id)}" ${i.id===selected?'selected':''}>${targetEsc(typeof inventoryItemLabel==='function'?inventoryItemLabel(i):i.name)}</option>`).join('')+(selected&&!list.some(i=>i.id===selected)?`<option selected value="${targetEsc(selected)}">登録のない在庫（選び直してください）</option>`:'');
}
function targetRowHtml(type,row,index){
  const m=BrewTargets.rowMeta(row),label=TARGET_ROW_LABELS[type]+(index+1),unit=type==='adjunct'?(row.unit||'g'):BrewTargets.rowTypes[type][1];
  const cell=(key,value,number=false,meta=false)=>targetControl(`data-${meta?'meta':'row'}="${key}" ${type==='mineral'&&key==='name'?'list="targetAdditiveNames"':''} aria-label="${targetEsc(label+' '+({name:'名称',manufacturer:'メーカー',lot:'ロット',alpha:'α酸（%）',ibu:'目標IBU',timingValue:'投入タイミング',unit:'単位',timingNote:'投入条件',concentration:'濃度（%）'}[key]||key))}"`,value,number?'number':'text');
  const qty=k=>{const quantityLabel=label+' '+(k==='batch1'?'Batch 1':'Batch 2');return `<span class="target-quantity-input">${targetControl(`data-meta="${k}" data-quantity-label="${targetEsc(quantityLabel)}" aria-label="${targetEsc(quantityLabel+'（'+unit+'）')}"`,m[k]??'', 'number')}<span class="target-quantity-unit" data-quantity-unit aria-hidden="true">${targetEsc(unit)}</span></span>`;};
  const details=type==='hop'?`<label>α酸（%）${cell('alpha',m.alpha,true,true)}</label><label>目標IBU${cell('ibu',m.ibu,true,true)}</label><label>投入方法<select data-row="timingType" aria-label="${label} 投入方法"><option value="boil" ${row.timingType!=='dryhop'?'selected':''}>煮沸終了前（分）</option><option value="dryhop" ${row.timingType==='dryhop'?'selected':''}>ドライホップ（日目）</option></select></label>${cell('timingValue',row.timingValue,true)}`:
    type==='adjunct'?`<label>単位${cell('unit',unit)}</label><label>投入工程<select data-row="timing" aria-label="${label} 投入工程">${['仕込み時','煮沸中','一次発酵中','二次発酵時','パッケージング時'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select></label><label>投入条件（終了何分前等）${cell('timingNote',m.timingNote,false,true)}</label>`:
    type==='mineral'?`<label>投入先<select data-row="timing" aria-label="${label} 投入先">${['仕込み水','スパージ水','煮沸中'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select></label><label>濃度（%・必要な場合）${cell('concentration',m.concentration,true,true)}</label>`:'<output data-ratio aria-label="配合比率"></output>';
  return `<tr data-target-row="${type}" data-base="${targetEsc(JSON.stringify(row))}"><td><label>名称${cell('name',row.name)}</label>${type!=='mineral'?`<label>在庫品目<select data-row="invId" aria-label="${label} 在庫品目">${targetOptions(type,row.invId)}</select></label><label>メーカー${cell('manufacturer',m.manufacturer,false,true)}</label><label>ロット${cell('lot',m.lot,false,true)}</label>`:''}</td><td><label>Batch 1${qty('batch1')}</label><label>Batch 2${qty('batch2')}</label><output data-amount-total></output></td><td>${details}</td><td><button type="button" class="inv-action-btn" data-remove-target-row aria-label="${label}の計画行を削除">削除</button></td></tr>`;
}
function targetRowsSection(type,b){
  const rows=b[BrewTargets.rowTypes[type][0]]||[],title=TARGET_ROW_LABELS[type],unit=type==='adjunct'?'':BrewTargets.rowTypes[type][1];
  return targetSection(title+`の予定量`, `<p class="target-note">数量は数字だけ入力してください${unit?`（例：100 ${unit}なら「100」）`: '（単位は各行で指定）'}。1回仕込みの場合はBatch 1だけ入力します。</p><div class="target-table-scroll"><table class="target-material-table"><caption class="sr-only">${title}の計画</caption><thead><tr><th>品目</th><th>予定量${unit?'（'+unit+'）':''}</th><th>${type==='fermentable'?'配合比率':'投入・成分の目標'}</th><th>操作</th></tr></thead><tbody id="target-rows-${type}">${(rows.length?rows:[{name:'',amount:'',timingType:'boil'}]).map((r,i)=>targetRowHtml(type,r,i)).join('')}</tbody></table></div><div class="target-row-footer"><button type="button" class="inv-action-btn" data-add-target-row="${type}">＋ ${title}を追加</button><output id="target-total-${type}"></output></div>`);
}
function targetMetricHtml(step,key,b){
  const m=BrewTargets.metrics[key];if(m[2]==='bound')return targetBound(key,b);
  const val=step.values[key]??'',label=m[0]+(m[1]?'（'+m[1]+'）':''),prefix=targetEsc(step.name+' '+label);
  const compare=m[2]==='number'&&['gravity','ph','volume'].includes(key)?`<select data-compare="${key}" aria-label="${prefix}の条件">${['=','<','<=','>','>='].map(op=>`<option value="${targetEsc(op)}" ${op===(step.comparisons?.[key]||'=')?'selected':''}>${targetEsc(op)}</option>`).join('')}</select>`:'';
  return `<div class="target-field"><label>${label}</label><div class="target-metric-input">${compare}${targetControl(`data-metric="${key}" aria-label="${prefix}"`,val,m[2])}${key==='gravity'?`<select data-gravity-unit aria-label="${prefix}の単位"><option ${step.gravityUnit==='SG'?'selected':''}>SG</option><option ${step.gravityUnit==='°P'?'selected':''}>°P</option></select>`:''}</div></div>`;
}
function targetStepHtml(step,b){return `<div class="target-step" data-step="${targetEsc(JSON.stringify(step))}"><div class="target-step-head">${targetControl('data-step-name aria-label="工程名"',step.name)}<button type="button" class="inv-action-btn" data-step-up aria-label="${targetEsc(step.name)}を上へ">↑</button><button type="button" class="inv-action-btn" data-step-down aria-label="${targetEsc(step.name)}を下へ">↓</button></div><div class="target-metrics">${step.slots.map(k=>targetMetricHtml(step,k,b)).join('')}</div></div>`;}
function renderBrewTargetSheet(b){
  const p=BrewTargets.waterPlan(b.brewTargets,b.waterVolume);
  const extra=keys=>`<div class="target-field-grid">${keys.map(k=>targetExtra(k,p)).join('')}</div>`;
  const identities=targetSection('バッチ・設備',`<div class="target-field-grid">${['batchName','style','brewDate','brewer','batchSize'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['batchNumber','tradeName','productName','tank','sanitizeDate','sanitizeBy','millGap']));
  const water=targetSection('水量・目標ミネラル',extra(['mashWater1','mashWater2','spargeWater1','spargeWater2'])+targetBound('waterVolume',b)+`<p><output id="target-water-total"></output></p><div class="target-field-grid target-ions">${['mCa','mMg','mNa','mCl','mSO4','mHCO3'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['sulfateChlorideRatio','residualAlkalinity']));
  const yeast=targetSection('酵母の投入計画',`<div class="target-field-grid">${['yeast','yeastAmount','yeastUnit'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['yeastSource','yeastGeneration','yeastHarvestDate','pitchRate','pitchRateUnit','cellDensity']));
  const results=targetSection('仕上がり・原価の目標',extra(['targetFG','targetABV','targetIBU','targetLoss','targetCost','planNotes']));
  document.getElementById('targetSheetBody').innerHTML=`<p class="operational-note">すべて予定・目標の入力欄です。実測値・発酵記録・在庫消費は変更しません。Batch 1/2は同じバッチにまとめる2回分の予定量で、合計が仕込みの原材料量に連動します。</p><datalist id="targetAdditiveNames">${['石膏（CaSO4）','エプソム塩（MgSO4）','食塩（NaCl）','重曹（NaHCO3）','塩化カルシウム（CaCl2）','炭酸カルシウム（CaCO3）','水酸化カルシウム（Ca(OH)2）','リン酸（H3PO4）','乳酸'].map(n=>`<option value="${targetEsc(n)}"></option>`).join('')}</datalist><div class="target-sheet-columns"><div>${identities}${targetRowsSection('fermentable',b)}${water}${targetRowsSection('hop',b)}${targetRowsSection('adjunct',b)}${targetRowsSection('mineral',b)}<p class="target-note">水質調整剤はgで入力し、投入先ごとに行を分けます。濃度は計画記録用で、既存の酸添加量計算には自動反映しません。推奨量を示す機能ではありません。</p>${yeast}${results}</div><div>${targetSection('工程ごとの目標',`<p class="target-note">時刻・温度・液量など必要な欄だけ入力します。空欄は未設定です。比重のSGと°P、IBU・ABV・pHは自動換算・予測しません。予定時刻は計画記録で、時間割や通知への自動転記は行いません。</p><div id="targetSteps">${BrewTargets.expandedSteps(p).map(s=>targetStepHtml(s,b)).join('')}</div><button type="button" class="add-row-btn" data-add-target-step>＋ 工程を追加（デコクション等）</button>`)}</div></div>`;
  document.getElementById('targetSheetTitle').textContent=targetSheetReadOnly?'目標仕込み表（保存済み）':'目標仕込み表を入力';
  document.getElementById('targetSheetApply').hidden=targetSheetReadOnly;
  document.getElementById('target-bound-waterVolume').readOnly=true;
  document.getElementById('targetSheetFooterNote').textContent=targetSheetReadOnly?'保存済みの予定・目標です。変更する場合は記録の「編集」から仕込み表を開いてください。':'「仕込みへ反映」の後、仕込み画面下部の「保存する」で確定します。';
  if(targetSheetReadOnly)document.querySelectorAll('#targetSheetBody input,#targetSheetBody select,#targetSheetBody button').forEach(e=>{e.disabled=true;if(e.tagName==='BUTTON')e.hidden=true;else if(e.tagName==='INPUT'&&!e.value)e.placeholder='未設定';});
  updateTargetSheetTotals();
  document.getElementById('targetSheetBody').scrollTop=0;
}
function targetCurrentForm(){return buildBatchFromForm(editingId||'target-draft');}
function openBrewTargetSheet(savedId){
  const dialog=document.getElementById('targetSheetDialog');if(dialog.open)return;
  const b=savedId?batches.find(x=>x.id===savedId):targetCurrentForm();if(!b)return;
  try{
    targetSheetReadOnly=!!savedId;targetSheetFocus=document.activeElement;
    targetSheetBefore=JSON.stringify(b);targetSheetSnapshot=JSON.stringify(window.fermentCloudData.getSnapshot());
    renderBrewTargetSheet(b);targetSheetDirty=false;document.getElementById('targetSheetError').textContent='';
    dialog.showModal();dialog.querySelector('.menu-close').focus({preventScroll:true});document.getElementById('targetSheetBody').scrollTop=0;syncModalState();
  }catch(e){alert(e.message);}
}
function closeBrewTargetSheet(){
  if(!targetSheetReadOnly&&targetSheetDirty&&!confirm('仕込み表で入力した未反映の変更を破棄しますか？'))return;
  document.getElementById('targetSheetDialog').close();
}
function readTargetRows(type){return [...document.querySelectorAll(`#target-rows-${type} tr`)].map(tr=>{
  const row=JSON.parse(tr.dataset.base),meta={...row.targetMeta};
  tr.querySelectorAll('[data-row]').forEach(e=>row[e.dataset.row]=e.value);
  tr.querySelectorAll('[data-meta]').forEach(e=>meta[e.dataset.meta]=e.value);
  row.targetMeta=meta;
  return BrewTargets.validateRow(type,row);
}).filter(r=>r.name||r.amount!==''||Object.entries(r.targetMeta).some(([k,v])=>!['batch1','batch2'].includes(k)&&v!==''));}
function readTargetPlan(){
  const original=JSON.parse(targetSheetBefore),p=BrewTargets.normalize(original.brewTargets);
  document.querySelectorAll('#targetSheetBody [data-extra]').forEach(e=>p.fields[e.dataset.extra]=e.value);
  p.steps=[...document.querySelectorAll('#targetSteps [data-step]')].map(el=>{
    const s=JSON.parse(el.dataset.step);s.name=el.querySelector('[data-step-name]').value;
    el.querySelectorAll('[data-metric]').forEach(e=>s.values[e.dataset.metric]=e.value);
    el.querySelectorAll('[data-compare]').forEach(e=>s.comparisons[e.dataset.compare]=e.value);
    const unit=el.querySelector('[data-gravity-unit]');if(unit)s.gravityUnit=unit.value;
    return s;
  });
  return BrewTargets.normalize(p);
}
function applyBrewTargetSheet(event){
  event.preventDefault();if(targetSheetReadOnly)return;
  const error=document.getElementById('targetSheetError');error.textContent='';
  try{
    if(JSON.stringify(targetCurrentForm())!==targetSheetBefore||JSON.stringify(window.fermentCloudData.getSnapshot())!==targetSheetSnapshot)throw Error('入力中に元の仕込み・クラウドデータが変わりました。変更内容を控え、閉じてから開き直してください。');
    const p=readTargetPlan(),bounds={};
    document.querySelectorAll('#targetSheetBody [data-bound]').forEach(e=>{
      const def=TARGET_BINDINGS.find(x=>x[0]===e.dataset.bound);
      bounds[e.dataset.bound]=def[2]==='number'?BrewTargets.numeric(e.value,def[1],def[0]==='targetOG'?1:def[0]==='mashTemp'?-50:0,def[0]==='targetOG'?1.3:1e9):e.value;
    });
    const rows={};for(const type of Object.keys(BrewTargets.rowTypes))rows[type]=readTargetRows(type);
    // Validate everything before changing the underlying form. No storage writes here.
    for(const type of ['fermentable','hop','adjunct'])for(const row of rows[type])if(row.invId){const item=inventory.find(i=>i.id===row.invId);if(!item||item.category!==type)throw Error(`${row.name}の在庫連携先を選び直してください。`);if(type==='adjunct'&&row.unit!==item.unit)throw Error(`${row.name}の単位を在庫の${item.unit}に合わせてください。`);}
    const yeastId=document.getElementById('f_yeastInv').value,yeastItem=inventory.find(i=>i.id===yeastId);
    if(yeastItem&&bounds.yeastUnit!==yeastItem.unit)throw Error(`酵母の単位は連携在庫の${yeastItem.unit}に合わせてください。`);
    if(![...document.getElementById('f_yeastUnit').options].some(o=>o.value===bounds.yeastUnit))throw Error('酵母の単位はg・包・パック・ml・個など、仕込み画面の選択肢に合わせてください。');
    for(const [k,v] of Object.entries(bounds))document.getElementById('f_'+k).value=v;
    document.getElementById('ph_waterVolume').value=bounds.waterVolume;
    for(const type of Object.keys(rows)){const container={fermentable:'fermentableRows',hop:'hopRows',adjunct:'adjunctRows',mineral:'mineralRows'}[type];document.getElementById(container).innerHTML='';rows[type].forEach(r=>addRow(container,type,r));}
    brewTargetDraft=p;markEditorDirty();updateAbvDisplay();updateMineralContributionSummary();updateBatchIconSuggestion();
    document.getElementById('targetPlanStatus').textContent='目標仕込み表を反映しました。画面下部の「保存する」で確定してください。';
    targetSheetDirty=false;document.getElementById('targetSheetDialog').close();
  }catch(e){error.textContent=e.message;error.focus();}
}
function updateTargetRowUnits(tr,type){
  const unit=type==='adjunct'?(tr.querySelector('[data-row=unit]')?.value||'').trim():BrewTargets.rowTypes[type][1];
  tr.querySelectorAll('[data-quantity-unit]').forEach(e=>e.textContent=unit||'単位未設定');
  tr.querySelectorAll('[data-quantity-label]').forEach(e=>e.setAttribute('aria-label',e.dataset.quantityLabel+'（'+(unit||'単位未設定')+'）'));
  return unit;
}
function updateTargetSheetTotals(){
  for(const type of Object.keys(BrewTargets.rowTypes)){
    const rows=[...document.querySelectorAll(`#target-rows-${type} tr`)];let total=0,has=false,invalid=false;
    rows.forEach(tr=>{const unit=updateTargetRowUnits(tr,type),a=tr.querySelector('[data-meta=batch1]').value,b=tr.querySelector('[data-meta=batch2]').value;try{const sum=BrewTargets.sum(BrewTargets.numeric(a,'量'),BrewTargets.numeric(b,'量'));tr.dataset.sum=sum;tr.querySelector('[data-amount-total]').textContent=sum===''?'合計 未設定':'合計 '+sum+' '+(unit||'（単位未設定）');if(sum!==''){has=true;total+=Number(sum);}}catch(e){tr.dataset.sum='';tr.querySelector('[data-amount-total]').textContent='数値を確認';invalid=true;}});
    const out=document.getElementById('target-total-'+type);if(out)out.textContent=type==='adjunct'?'単位の異なる副原料は合算しません。':invalid?'入力値を確認してください':has?`合計 ${Number(total.toFixed(6))} ${BrewTargets.rowTypes[type][1]}`:'合計 未設定';
    if(type==='fermentable')rows.forEach(tr=>tr.querySelector('[data-ratio]').textContent=total>0&&tr.dataset.sum!==''&&!invalid?(Number(tr.dataset.sum)/total*100).toFixed(1)+'%':'—');
  }
  const water=['[data-extra=mashWater1]','[data-extra=mashWater2]','[data-extra=spargeWater1]','[data-extra=spargeWater2]'].map(s=>document.querySelector('#targetSheetBody '+s)?.value||'');
  const mashTotal=document.getElementById('target-bound-waterVolume');if(mashTotal)try{mashTotal.value=BrewTargets.sum(BrewTargets.numeric(water[0],'糖化用水'),BrewTargets.numeric(water[1],'糖化用水'));}catch(e){mashTotal.value='';}
  const out=document.getElementById('target-water-total');if(out)try{out.textContent=water.every(v=>v==='')?'予定総水量 未設定':'予定総水量 '+water.map(v=>Number(BrewTargets.numeric(v,'水量'))).reduce((a,b)=>a+b,0).toFixed(2)+' L（糖化用水＋スパージ水）';}catch(e){out.textContent='水量を確認してください。';}
}
document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.getElementById('targetSheetDialog'),body=document.getElementById('targetSheetBody');
  document.getElementById('targetSheetForm').addEventListener('submit',applyBrewTargetSheet);
  document.addEventListener('click',e=>{const button=e.target.closest('[data-view-brew-targets]');if(button)openBrewTargetSheet(button.dataset.viewBrewTargets);});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeBrewTargetSheet();});
  dialog.addEventListener('close',()=>{syncModalState();targetSheetFocus?.focus();});
  body.addEventListener('input',()=>{targetSheetDirty=true;updateTargetSheetTotals();});
  body.addEventListener('change',e=>{
    targetSheetDirty=true;const select=e.target;if(select.matches('[data-row=invId]')&&select.value){const item=inventory.find(i=>i.id===select.value),tr=select.closest('tr');if(item){tr.querySelector('[data-row=name]').value=item.name;tr.querySelector('[data-meta=manufacturer]').value=item.manufacturer||'';tr.querySelector('[data-meta=lot]').value=item.lotCode||'';const unit=tr.querySelector('[data-row=unit]');if(unit)unit.value=item.unit;}}
    updateTargetSheetTotals();
  });
  body.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button||targetSheetReadOnly)return;
    if(button.hasAttribute('data-add-target-row')){const type=button.dataset.addTargetRow,tb=document.getElementById('target-rows-'+type);tb.insertAdjacentHTML('beforeend',targetRowHtml(type,{name:'',amount:'',timingType:'boil'},tb.children.length));targetSheetDirty=true;}
    if(button.hasAttribute('data-remove-target-row')){const tr=button.closest('tr');if(!confirm('この予定行を仕込み表から削除しますか？「仕込みへ反映」するまでは元の入力は変わりません。'))return;tr.remove();targetSheetDirty=true;}
    if(button.hasAttribute('data-add-target-step')){const container=document.getElementById('targetSteps');if(container.children.length>=100){alert('工程は100行以内です。');return;}container.insertAdjacentHTML('beforeend',targetStepHtml({id:uid(),name:'追加工程',slots:['time','duration','temp','gravity','ph','volume','note'],values:{},gravityUnit:'SG',comparisons:{}},{}));targetSheetDirty=true;}
    if(button.hasAttribute('data-step-up')||button.hasAttribute('data-step-down')){const step=button.closest('[data-step]');if(button.hasAttribute('data-step-up')&&step.previousElementSibling)step.previousElementSibling.before(step);else if(button.hasAttribute('data-step-down')&&step.nextElementSibling)step.nextElementSibling.after(step);targetSheetDirty=true;button.focus();}
    updateTargetSheetTotals();
  });
});
