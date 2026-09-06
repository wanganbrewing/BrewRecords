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
  const second=scope==='extra'&&['mashWater2','spargeWater2'].includes(key)?' data-second-brew':'';
  return `<div class="target-field"${second}><label for="${id}">${targetEsc(label)}${unit?'（'+targetEsc(unit)+'）':''}</label>${targetControl(`id="${id}" data-${scope}="${key}"`,value,type)}</div>`;
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
  const qty=k=>{const quantityLabel=label+' '+(k==='batch1'?'仕込み1回目':'仕込み2回目');return `<span class="target-quantity-input">${targetControl(`data-meta="${k}" data-quantity-label="${targetEsc(quantityLabel)}" aria-label="${targetEsc(quantityLabel+'（'+unit+'）')}"`,m[k]??'', 'number')}<span class="target-quantity-unit" data-quantity-unit aria-hidden="true">${targetEsc(unit)}</span></span>`;};
  const inventoryCell=type==='mineral'?'':`<td class="target-cell-wide"><select data-row="invId" aria-label="${label} 在庫品目">${targetOptions(type,row.invId)}</select></td>`;
  const manufacturer=type==='mineral'?'':`<td>${cell('manufacturer',m.manufacturer,false,true)}</td><td>${cell('lot',m.lot,false,true)}</td>`;
  const second=`<td data-second-brew>${qty('batch2')}</td>`;
  const total='<td><output data-amount-total></output></td>';
  let details='',unitCell='';
  if(type==='fermentable')details=`<td><output data-ratio aria-label="配合比率"></output></td>`;
  if(type==='hop')details=`<td>${cell('alpha',m.alpha,true,true)}</td><td><select data-row="timingType" aria-label="${label} 投入方法"><option value="boil" ${row.timingType!=='dryhop'?'selected':''}>煮沸終了前</option><option value="dryhop" ${row.timingType==='dryhop'?'selected':''}>ドライホップ</option></select></td><td>${cell('timingValue',row.timingValue,true)}</td><td>${cell('ibu',m.ibu,true,true)}</td>`;
  if(type==='adjunct'){unitCell=`<td>${cell('unit',unit)}</td>`;details=`<td><select data-row="timing" aria-label="${label} 投入工程">${['仕込み時','煮沸中','一次発酵中','二次発酵時','パッケージング時'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select></td><td>${cell('timingNote',m.timingNote,false,true)}</td>`;}
  if(type==='mineral')details=`<td><select data-row="timing" aria-label="${label} 投入先">${['仕込み水','スパージ水','煮沸中'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select></td><td>${cell('concentration',m.concentration,true,true)}</td>`;
  return `<tr data-target-row="${type}" data-base="${targetEsc(JSON.stringify(row))}"><td class="target-cell-wide">${cell('name',row.name)}</td>${inventoryCell}${manufacturer}<td>${qty('batch1')}</td>${second}${unitCell}${total}${details}<td><button type="button" class="inv-action-btn" data-remove-target-row aria-label="${label}の計画行を削除">削除</button></td></tr>`;
}
function targetRowHeaders(type,unit){
  const base=type==='mineral'?['名称']:['名称','在庫品目','メーカー','ロット'];
  const quantities=['仕込み1回目'+(unit?'（'+unit+'）':''),'仕込み2回目'+(unit?'（'+unit+'）':'')];
  const end={fermentable:['合計','配合率'],hop:['合計','α酸（%）','投入方法','投入時期','目標IBU'],adjunct:['単位','合計','投入工程','投入条件'],mineral:['合計','投入先','濃度（%）']}[type];
  return [...base,...quantities,...end,'操作'].map((v,i)=>`<th ${i===base.length+1?'data-second-brew':''}>${v}</th>`).join('');
}
function targetRowsSection(type,b){
  const rows=b[BrewTargets.rowTypes[type][0]]||[],title=TARGET_ROW_LABELS[type],unit=type==='adjunct'?'':BrewTargets.rowTypes[type][1];
  return targetSection(title+`の予定量`, `<p class="target-note">数量は数字だけ入力してください${unit?`（例：100 ${unit}なら「100」）`: '（単位は各行で指定）'}。</p><div class="target-table-scroll"><table class="target-material-table"><caption class="sr-only">${title}の計画</caption><thead><tr>${targetRowHeaders(type,unit)}</tr></thead><tbody id="target-rows-${type}">${(rows.length?rows:[{name:'',amount:'',timingType:'boil'}]).map((r,i)=>targetRowHtml(type,r,i)).join('')}</tbody></table></div><div class="target-row-footer"><button type="button" class="inv-action-btn" data-add-target-row="${type}">＋ ${title}を追加</button><output id="target-total-${type}"></output></div>`);
}
function targetMetricHtml(step,key,b){
  const m=BrewTargets.metrics[key];if(m[2]==='bound')return targetBound(key,b);
  const val=step.values[key]??'',label=m[0]+(m[1]?'（'+m[1]+'）':''),prefix=targetEsc(step.name+' '+label);
  const compare=m[2]==='number'&&['gravity','ph','volume'].includes(key)?`<select data-compare="${key}" aria-label="${prefix}の条件">${['=','<','<=','>','>='].map(op=>`<option value="${targetEsc(op)}" ${op===(step.comparisons?.[key]||'=')?'selected':''}>${targetEsc(op)}</option>`).join('')}</select>`:'';
  return `<div class="target-field"><label>${label}</label><div class="target-metric-input">${compare}${targetControl(`data-metric="${key}" aria-label="${prefix}"`,val,m[2])}${key==='gravity'?`<select data-gravity-unit aria-label="${prefix}の単位"><option ${step.gravityUnit==='SG'?'selected':''}>SG</option><option ${step.gravityUnit==='°P'?'selected':''}>°P</option></select>`:''}</div></div>`;
}
function targetStepGroup(step,keys,b,label){const fields=keys.filter(k=>step.slots.includes(k)).map(k=>targetMetricHtml(step,k,b)).join('');return `<td data-label="${label}">${fields||'<span class="target-empty-cell">—</span>'}</td>`;}
function targetStepHtml(step,b,index=0){return `<tr class="target-step" data-step="${targetEsc(JSON.stringify(step))}"><td data-label="順番"><span class="target-step-number">${index+1}</span></td><td class="target-step-head" data-label="工程">${targetControl('data-step-name aria-label="工程名"',step.name)}</td>${targetStepGroup(step,['time'],b,'予定時刻')}${targetStepGroup(step,['duration','mashTime','boilTime'],b,'時間')}${targetStepGroup(step,['temp','mashTemp'],b,'温度')}${targetStepGroup(step,['volume'],b,'液量')}${targetStepGroup(step,['gravity','targetOG','plato'],b,'比重・糖度')}${targetStepGroup(step,['ph'],b,'pH')}${targetStepGroup(step,['flow','pressure','note'],b,'条件・備考')}<td class="target-step-actions" data-label="操作"><button type="button" class="inv-action-btn" data-step-up aria-label="${targetEsc(step.name)}を上へ">↑</button><button type="button" class="inv-action-btn" data-step-down aria-label="${targetEsc(step.name)}を下へ">↓</button><button type="button" class="inv-action-btn" data-remove-target-step aria-label="${targetEsc(step.name)}を削除">削除</button></td></tr>`;}
function targetProcessSection(p,b){const steps=BrewTargets.expandedSteps(p);return targetSection('工程ごとの目標',`<p class="target-note">必要なセルだけ入力します。空欄は未設定です。予定時刻は時間割や通知へ自動転記しません。</p><div class="target-table-scroll"><table class="target-process-table"><thead><tr><th>順</th><th>工程</th><th>予定時刻</th><th>時間（分）</th><th>温度（℃）</th><th>液量（L）</th><th>比重・糖度</th><th>pH</th><th>流量・圧力・条件</th><th>操作</th></tr></thead><tbody id="targetSteps">${steps.map((s,i)=>targetStepHtml(s,b,i)).join('')}</tbody></table></div><button type="button" class="add-row-btn" data-add-target-step>＋ 工程を追加（デコクション等）</button>`);}
function renderBrewTargetSheet(b){
  const p=BrewTargets.waterPlan(b.brewTargets,b.waterVolume);
  const extra=keys=>`<div class="target-field-grid">${keys.map(k=>targetExtra(k,p)).join('')}</div>`;
  const identities=targetSection('バッチ・設備',`<div class="target-field-grid">${['batchName','style','brewDate','brewer','batchSize'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['batchNumber','tradeName','productName','tank','sanitizeDate','sanitizeBy','millGap']));
  const water=targetSection('水量・目標ミネラル',extra(['mashWater1','mashWater2','spargeWater1','spargeWater2'])+targetBound('waterVolume',b)+`<p><output id="target-water-total"></output></p><div class="target-field-grid target-ions">${['mCa','mMg','mNa','mCl','mSO4','mHCO3'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['sulfateChlorideRatio','residualAlkalinity']));
  const yeast=targetSection('酵母の投入計画',`<div class="target-field-grid">${['yeast','yeastAmount','yeastUnit'].map(k=>targetBound(k,b)).join('')}</div>`+extra(['yeastSource','yeastGeneration','yeastHarvestDate','pitchRate','pitchRateUnit','cellDensity']));
  const results=targetSection('仕上がり・原価の目標',extra(['targetFG','targetABV','targetIBU','targetLoss','targetCost','planNotes']));
  const hasSecond=p.fields.doubleBrew===true||['mashWater2','spargeWater2'].some(k=>p.fields[k]!==''&&p.fields[k]!=null)||Object.values(BrewTargets.rowTypes).some(([key])=>(b[key]||[]).some(r=>r.targetMeta?.batch2!==''&&r.targetMeta?.batch2!=null));
  document.getElementById('targetSheetBody').innerHTML=`<p class="operational-note">PCでは3つのシートに分けて入力します。すべて予定・目標で、実測値・発酵記録・在庫消費は変更しません。</p><nav class="target-sheet-tabs" role="tablist" aria-label="仕込み計画の入力シート"><button type="button" role="tab" data-target-sheet-tab="basic">① 基本計画</button><button type="button" role="tab" data-target-sheet-tab="materials">② 原材料・水</button><button type="button" role="tab" data-target-sheet-tab="process">③ 仕込み工程</button></nav><div class="target-plan-status" id="targetPlanSummary" role="status"></div><datalist id="targetAdditiveNames">${['石膏（CaSO4）','エプソム塩（MgSO4）','食塩（NaCl）','重曹（NaHCO3）','塩化カルシウム（CaCl2）','炭酸カルシウム（CaCO3）','水酸化カルシウム（Ca(OH)2）','リン酸（H3PO4）','乳酸'].map(n=>`<option value="${targetEsc(n)}"></option>`).join('')}</datalist><div class="target-sheet-panes"><div data-target-sheet-pane="basic"><div class="target-basic-grid"><div>${identities}</div><div>${yeast}${results}</div></div></div><div data-target-sheet-pane="materials"><div class="target-double-brew"><label><input type="checkbox" id="targetDoubleBrew" ${hasSecond?'checked':''}>2回に分けて仕込み、同じ発酵タンクへまとめる</label><span>通常はオフのまま、仕込み1回目だけ入力します。</span></div>${targetRowsSection('fermentable',b)}${water}${targetRowsSection('hop',b)}${targetRowsSection('adjunct',b)}${targetRowsSection('mineral',b)}<p class="target-note">水質調整剤はgで入力し、投入先ごとに行を分けます。濃度は計画記録用で、酸添加量計算には自動反映しません。</p></div><div data-target-sheet-pane="process">${targetProcessSection(p,b)}</div></div>`;
  document.getElementById('targetSheetTitle').textContent=targetSheetReadOnly?'目標仕込み表（保存済み）':'目標仕込み表を入力';
  document.getElementById('targetSheetApply').hidden=targetSheetReadOnly;
  document.getElementById('target-bound-waterVolume').readOnly=true;
  document.getElementById('targetSheetFooterNote').textContent=targetSheetReadOnly?'保存済みの予定・目標です。変更する場合は記録の「編集」から仕込み表を開いてください。':'3シートの入力内容をまとめて保存します。';
  if(targetSheetReadOnly)document.querySelectorAll('#targetSheetBody input,#targetSheetBody select,#targetSheetBody button:not([data-target-sheet-tab])').forEach(e=>{e.disabled=true;if(e.tagName==='BUTTON')e.hidden=true;else if(e.tagName==='INPUT'&&!e.value)e.placeholder='未設定';});
  updateTargetSheetTotals();
  selectTargetSheet('basic',false);
  updateSecondBrewView();
  document.getElementById('targetSheetBody').scrollTop=0;
}
function selectTargetSheet(name,focus=true){
  const body=document.getElementById('targetSheetBody');if(!body)return;
  body.dataset.activeTargetSheet=name;
  body.querySelectorAll('[data-target-sheet-tab]').forEach(button=>{const active=button.dataset.targetSheetTab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;if(active&&focus)button.focus();});
  body.querySelectorAll('[data-target-sheet-pane]').forEach(pane=>pane.dataset.active=String(pane.dataset.targetSheetPane===name));
  body.scrollTop=0;
}
function updateSecondBrewView(){const body=document.getElementById('targetSheetBody'),checked=document.getElementById('targetDoubleBrew')?.checked===true;if(body)body.dataset.doubleBrew=String(checked);}
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
  p.fields.doubleBrew=document.getElementById('targetDoubleBrew')?.checked===true;
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
  event.preventDefault();if(targetSheetReadOnly)return false;
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
    document.getElementById('targetPlanStatus').textContent='仕込み計画を保存しました。';
    targetSheetDirty=false;document.getElementById('targetSheetDialog').close();
    return true;
  }catch(e){error.textContent=e.message;error.focus();return false;}
}
async function saveBrewTargetSheet(event){
  event.preventDefault();if(targetSheetReadOnly)return;
  const error=document.getElementById('targetSheetError'),button=document.getElementById('targetSheetApply');
  if(!document.getElementById('target-bound-batchName').value.trim()){selectTargetSheet('basic');error.textContent='バッチ名を入力してください。';error.focus();return;}
  button.disabled=true;button.textContent='保存中…';
  try{
    const applied=applyBrewTargetSheet({preventDefault(){}});
    if(applied)await saveBatch();
  }finally{
    button.disabled=false;button.textContent='仕込み計画を保存';
  }
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
  const summary=document.getElementById('targetPlanSummary');if(summary){const batch=document.getElementById('target-bound-batchName')?.value.trim(),materials=[...document.querySelectorAll('[data-target-row] [data-row=name]')].filter(e=>e.value.trim()).length,goals=[...document.querySelectorAll('#targetSteps [data-metric]')].filter(e=>e.value!==''),filledSteps=new Set(goals.map(e=>e.closest('[data-step]'))).size;summary.textContent=`バッチ名：${batch?'入力済み':'未入力'}　原材料：${materials}品目　目標入力済み工程：${filledSteps}件`;}
}
document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.getElementById('targetSheetDialog'),body=document.getElementById('targetSheetBody');
  document.getElementById('targetSheetForm').addEventListener('submit',saveBrewTargetSheet);
  document.addEventListener('click',e=>{const button=e.target.closest('[data-view-brew-targets]');if(button)openBrewTargetSheet(button.dataset.viewBrewTargets);});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeBrewTargetSheet();});
  dialog.addEventListener('close',()=>{syncModalState();targetSheetFocus?.focus();});
  body.addEventListener('input',()=>{targetSheetDirty=true;updateTargetSheetTotals();});
  body.addEventListener('change',e=>{
    targetSheetDirty=true;const select=e.target;if(select.id==='targetDoubleBrew'&&!select.checked){const second=[...body.querySelectorAll('[data-meta=batch2],[data-extra=mashWater2],[data-extra=spargeWater2]')].filter(i=>i.value!=='');if(second.length&&!confirm('仕込み2回目に入力済みの値があります。値を消して1回仕込みへ戻しますか？')){select.checked=true;}else second.forEach(i=>i.value='');updateSecondBrewView();}else if(select.id==='targetDoubleBrew')updateSecondBrewView();if(select.matches('[data-row=invId]')&&select.value){const item=inventory.find(i=>i.id===select.value),tr=select.closest('tr');if(item){tr.querySelector('[data-row=name]').value=item.name;tr.querySelector('[data-meta=manufacturer]').value=item.manufacturer||'';tr.querySelector('[data-meta=lot]').value=item.lotCode||'';const unit=tr.querySelector('[data-row=unit]');if(unit)unit.value=item.unit;}}
    updateTargetSheetTotals();
  });
  body.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-target-sheet-tab')){selectTargetSheet(button.dataset.targetSheetTab);return;}
    if(targetSheetReadOnly)return;
    if(button.hasAttribute('data-add-target-row')){const type=button.dataset.addTargetRow,tb=document.getElementById('target-rows-'+type);tb.insertAdjacentHTML('beforeend',targetRowHtml(type,{name:'',amount:'',timingType:'boil'},tb.children.length));targetSheetDirty=true;}
    if(button.hasAttribute('data-remove-target-row')){const tr=button.closest('tr');if(!confirm('この予定行を仕込み計画から削除しますか？「仕込み計画を保存」するまでは記録に反映されません。'))return;tr.remove();targetSheetDirty=true;}
    if(button.hasAttribute('data-add-target-step')){const container=document.getElementById('targetSteps');if(container.children.length>=100){alert('工程は100行以内です。');return;}container.insertAdjacentHTML('beforeend',targetStepHtml({id:uid(),name:'追加工程',slots:['time','duration','temp','gravity','ph','volume','note'],values:{},gravityUnit:'SG',comparisons:{}},container.children.length));targetSheetDirty=true;}
    if(button.hasAttribute('data-remove-target-step')){if(!confirm('この工程を仕込み計画から削除しますか？'))return;button.closest('[data-step]').remove();targetSheetDirty=true;}
    if(button.hasAttribute('data-step-up')||button.hasAttribute('data-step-down')){const step=button.closest('[data-step]');if(button.hasAttribute('data-step-up')&&step.previousElementSibling)step.previousElementSibling.before(step);else if(button.hasAttribute('data-step-down')&&step.nextElementSibling)step.nextElementSibling.after(step);[...document.querySelectorAll('#targetSteps .target-step-number')].forEach((e,i)=>e.textContent=i+1);targetSheetDirty=true;button.focus();}
    updateTargetSheetTotals();
  });
});
