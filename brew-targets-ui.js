let brewTargetDraft=null,targetSheetBefore='',targetSheetSnapshot='',targetSheetReadOnly=false,targetSheetDirty=false,targetSheetFocus=null,targetSheetBatchId='',pendingBrewTargetImport=null;
const TARGET_BINDINGS=[
  ['style','スタイル','text'],['taxCategory','酒税法上の品目区分','text'],['brewDate','仕込み予定日','date'],['brewer','担当者','text'],['batchSize','予定仕込み量','number','L'],
  ['waterVolume','糖化用水 合計（仕込み水量へ連動）','number','L'],['targetOG','目標OG','number','SG'],['actualOG','実測OG（仕込み後）','number','SG'],['mashTemp','目標糖化温度','number','℃'],['mashTime','目標糖化時間','number','分'],['boilTime','目標煮沸時間','number','分'],
  ['yeast','酵母名','text'],['yeastAmount','酵母の使用量','number','g'],
  ['mCa','Ca²⁺','number','ppm'],['mMg','Mg²⁺','number','ppm'],['mNa','Na⁺','number','ppm'],['mCl','Cl⁻','number','ppm'],['mSO4','SO₄²⁻','number','ppm'],['mHCO3','HCO₃⁻','number','ppm']
];
const TARGET_RANGES={targetOG:[1,1.3],actualOG:[1,1.3],mashTemp:[-50,200]};
const TARGET_ROW_LABELS={fermentable:'モルト',hop:'ホップ',adjunct:'副原料',mineral:'水質調整剤'};
const TARGET_TAX_CHOICES=['ビール・発泡酒等（発泡性酒類）','ビール','発泡酒(1)','発泡酒(2)','発泡酒(3)','果実酒','清酒','その他の醸造酒','リキュール'];
const TARGET_TANK_CHOICES=Array.from({length:8},(_,i)=>`FV${i+1}`);
const TARGET_YEAST_CHOICES=['Fermentis US-05','Fermentis S-04','Fermentis T-58','Fermentis WB-06','Lallemand Nottingham','Lallemand London ESB','Lallemand BRY-97','Wyeast 1056 American Ale','Wyeast 1214 Belgian Abbey','Wyeast 3711 French Saison','White Labs WLP001 California Ale','White Labs WLP300 Hefeweizen','White Labs WLP800 Pilsner Lager'];
const TARGET_YEAST_SOURCES=['fresh pitch','乾燥酵母','回収酵母（スラリー）','培養スターター','再投入（repitch）'];
const TARGET_SRM_CHOICES=Array.from({length:40},(_,i)=>{const n=i+1,label=n<=2?'非常に淡い':n<=6?'淡い':n<=12?'金色〜琥珀':n<=20?'琥珀〜褐色':n<=30?'褐色':n<=39?'濃い褐色':'黒に近い';return [String(n),`SRM ${n} — ${label}`];});
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
function targetSelectBound(key,label,value,options){const id=`target-bound-${key}`;return `<div class="target-field"><label for="${id}">${targetEsc(label)}</label><select id="${id}" data-bound="${key}">${options.map(([v,t])=>`<option value="${targetEsc(v)}" ${v===(value??'')?'selected':''}>${targetEsc(t)}</option>`).join('')}</select></div>`;}
function targetExtra(key,plan){return targetField(BrewTargets.fields.find(x=>x[0]===key),plan.fields[key]??'');}
function targetSection(title,content){return `<section class="target-section"><h3>${title}</h3>${content}</section>`;}
function targetChoiceField(key,label,value,choices,scope='bound',type='text'){
  const id=`target-${scope}-${key}`,preset=`${id}-preset`,options=choices.filter(Boolean).map(choice=>Array.isArray(choice)?{value:String(choice[0]),label:String(choice[1])}:{value:String(choice),label:String(choice)}),hasPreset=options.some(option=>option.value===String(value??''));
  return `<div class="target-field target-choice-field"><label for="${preset}">${targetEsc(label)}（選択・自由入力）</label><select id="${preset}" data-target-choice="${key}"><option value="" ${!value?'selected':''}>一覧から選ぶ</option>${options.map(option=>`<option value="${targetEsc(option.value)}" ${option.value===String(value??'')?'selected':''}>${targetEsc(option.label)}</option>`).join('')}<option value="__custom__" ${value&&!hasPreset?'selected':''}>自由入力</option></select>${targetControl(`id="${id}" class="target-choice-custom" data-${scope}="${key}" aria-label="${targetEsc(label)}の自由入力" placeholder="一覧にない場合は入力" ${hasPreset||!value?'hidden':''}`,value,type)}</div>`;
}
function targetStyleField(b){return targetChoiceField('style','スタイル名',b.style||'',(globalThis.BEER_STYLE_GUIDE||[]).map(style=>style.name))+'<div class="style-reference" id="targetStyleReference" aria-live="polite"></div>';}
function targetYeastField(b){return targetChoiceField('yeast','酵母',b.yeast||'',TARGET_YEAST_CHOICES);}
function targetTaxField(b){return targetSelectBound('taxCategory','酒税法上の品目区分',b.taxCategory||'',[['','選択してください'],...TARGET_TAX_CHOICES.map(value=>[value,value])]);}
function targetTankField(p){return targetChoiceField('tank','使用予定タンク',p.fields.tank||'',TARGET_TANK_CHOICES,'extra');}
function targetSrmField(p){return targetChoiceField('targetSRM','目標SRM',p.fields.targetSRM??'',TARGET_SRM_CHOICES,'extra','number');}
function computedAbv(og,fg){const start=Number(og),finish=Number(fg);return Number.isFinite(start)&&Number.isFinite(finish)&&start>=1&&finish>=1&&start>=finish?((start-finish)*131.25).toFixed(1):'';}
function targetAbvField(p){return `<div class="target-field"><label for="target-extra-targetABV">目標ABV（%・自動計算）</label>${targetControl('id="target-extra-targetABV" data-extra="targetABV" readonly aria-readonly="true"',p.fields.targetABV??'','number')}<small class="target-inline-note">目標OGと目標FGから自動計算します。</small></div>`;}
function targetIbuField(p){return `<div class="target-field"><label for="target-extra-targetIBU">目標IBU（自動計算）</label>${targetControl('id="target-extra-targetIBU" data-extra="targetIBU" readonly aria-readonly="true"',p.fields.targetIBU??'','number')}<small class="target-inline-note">ホップ重量・α酸・投入時期・仕込み量から概算します。</small></div>`;}
function targetActualReference(label,value,note=''){return `<div class="target-field"><label>${targetEsc(label)}</label><div class="target-bound-reference">${targetEsc(value||'未入力')}</div>${note?`<small class="target-inline-note">${targetEsc(note)}</small>`:''}</div>`;}
function updateTargetAbv(){const field=document.getElementById('target-extra-targetABV');if(field)field.value=computedAbv(document.getElementById('target-bound-targetOG')?.value,document.getElementById('target-extra-targetFG')?.value);}
function syncTargetChoice(select,focus=false){
  const key=select.dataset.targetChoice,input=document.querySelector(`#targetSheetBody [data-bound="${key}"],#targetSheetBody [data-extra="${key}"]`);if(!input)return;
  if(select.value==='__custom__'){const preset=[...select.options].some(option=>option.value&&option.value!=='__custom__'&&option.value===input.value);if(preset)input.value='';input.hidden=false;if(focus)input.focus();}
  else{input.value=select.value;input.hidden=true;}
}
function setTargetChoiceValue(key,value){const select=document.querySelector(`#targetSheetBody [data-target-choice="${key}"]`),input=document.querySelector(`#targetSheetBody [data-bound="${key}"],#targetSheetBody [data-extra="${key}"]`);if(!select||!input)return;const option=[...select.options].find(item=>item.value===value);select.value=option?value:'__custom__';input.value=value;input.hidden=!!option;}
function targetYeastInventoryField(b){
  const options=inventory.filter(item=>item.category==='yeast').map(item=>`<option value="${targetEsc(item.id)}" ${item.id===b.yeastInvId?'selected':''}>${targetEsc(item.name)}</option>`).join('');
  return `<div class="target-field"><label for="targetYeastInventory">在庫品目との連携（任意）</label><select id="targetYeastInventory"><option value="">在庫と未連携</option>${options}</select></div>`;
}
function targetYeastSourceField(p){return targetChoiceField('yeastSource','酵母の由来',p.fields.yeastSource||'',TARGET_YEAST_SOURCES,'extra');}
function suggestedBatchNumber(){
  const history=(typeof batches==='undefined'?[]:batches).map(batch=>({value:String(batch?.brewTargets?.fields?.batchNumber||'').trim(),date:batch?.brewDate||''})).filter(item=>item.value).sort((a,b)=>b.date.localeCompare(a.date));
  const latest=history[0]?.value||'',match=latest.match(/^(.*?)(\d+)$/);
  if(match)return match[1]+String(Number(match[2])+1).padStart(match[2].length,'0');
  const numbers=history.map(item=>Number(item.value.match(/(\d+)$/)?.[1])).filter(Number.isFinite);
  return String((numbers.length?Math.max(...numbers):0)+1);
}
function targetBatchNumberField(p){
  const value=p.fields.batchNumber??'';
  return `<div class="target-field target-batch-number"><label for="target-extra-batchNumber">バッチ番号</label><div class="target-inline-action">${targetControl('id="target-extra-batchNumber" data-extra="batchNumber" aria-label="バッチ番号"',value)}<button type="button" class="inv-action-btn" data-auto-batch-number>履歴から採番</button></div><small class="target-inline-note">ボタンで次の番号を入れた後も自由に修正できます。</small></div>`;
}
function targetSplitWaterField(key,p){
  const labels={mashWater1:['糖化用水','糖化用水 1回目'],mashWater2:['糖化用水 2回目','糖化用水 2回目'],spargeWater1:['スパージ水','スパージ水 1回目'],spargeWater2:['スパージ水 2回目','スパージ水 2回目']},id=`target-extra-${key}`,second=['mashWater2','spargeWater2'].includes(key)?' data-second-brew':'';
  const [single,double]=labels[key];
  return `<div class="target-field"${second}><label for="${id}" data-water-split-label data-single-label="${single}" data-double-label="${double}">${single}（L）</label>${targetControl(`id="${id}" data-extra="${key}"`,p.fields[key]??'','number')}</div>`;
}
function findStyleGuide(value){const key=String(value||'').normalize('NFKC').trim().toLocaleLowerCase();return (globalThis.BEER_STYLE_GUIDE||[]).find(style=>style.name.normalize('NFKC').trim().toLocaleLowerCase()===key);}
function updateTargetStyleReference(){
  const output=document.getElementById('targetStyleReference'),input=document.getElementById('target-bound-style');if(!output||!input)return;
  const style=findStyleGuide(input.value);if(!style){output.innerHTML=input.value.trim()?'<strong>自由入力のスタイル</strong><span>公式参考値は表示されません。OG・FG・ABV・IBU・SRMは下の目標欄へ直接入力してください。</span>':'<strong>スタイルを選ぶと参考値を表示します</strong><span>日本地ビール協会の2024年4月ガイドラインを参照します。</span>';return;}
  const metric=(label,value)=>`<div><span>${label}</span><strong>${targetEsc(value||'規定なし')}</strong></div>`;
  output.innerHTML=`<p><strong>スタイルガイド参考値（入力値ではありません）</strong><a href="${targetEsc(style.url)}" target="_blank" rel="noopener">基準を見る ↗</a></p><div class="style-reference-grid">${metric('OG',style.og)}${metric('FG',style.fg)}${metric('ABV',style.abv)}${metric('IBU',style.ibu)}${metric('SRM',style.srm)}</div><small>入力枠とは連携せず、選んだスタイルの参考範囲だけを表示しています。</small>`;
}
function targetOptions(type,selected){
  const list=type==='mineral'?[]:inventory.filter(i=>i.category===type);
  return `<option value="">在庫と未連携</option>`+list.map(i=>`<option value="${targetEsc(i.id)}" ${i.id===selected?'selected':''}>${targetEsc(i.name)}</option>`).join('')+(selected&&!list.some(i=>i.id===selected)?`<option selected value="${targetEsc(selected)}">登録のない在庫（選び直してください）</option>`:'');
}
function targetRowHtml(type,row,index){
  const m=BrewTargets.rowMeta(row),label=TARGET_ROW_LABELS[type]+(index+1),unit=BrewTargets.rowTypes[type][1];
  const td=(name,content,className='',attrs='')=>`<td${className?` class="${className}"`:''} data-label="${targetEsc(name)}" ${attrs}>${content}</td>`;
  const cell=(key,value,number=false,meta=false)=>targetControl(`data-${meta?'meta':'row'}="${key}" ${type==='mineral'&&key==='name'?'list="targetAdditiveNames"':''} aria-label="${targetEsc(label+' '+({name:'名称',manufacturer:'メーカー',lot:'ロット',alpha:'α酸（%）',ibu:'目標IBU',timingValue:'投入タイミング',unit:'単位',timingNote:'投入条件',concentration:'濃度（%）'}[key]||key))}"`,value,number?'number':'text');
  const qty=k=>{const quantityLabel=label+' '+(k==='batch1'?'重さ':'2回目の重さ');return `<span class="target-quantity-input">${targetControl(`data-meta="${k}" data-quantity-label="${targetEsc(quantityLabel)}" aria-label="${targetEsc(quantityLabel+'（'+unit+'）')}"`,m[k]??'', 'number')}<span class="target-quantity-unit" data-quantity-unit aria-hidden="true">${targetEsc(unit)}</span></span>`;};
  const inventoryCell=type==='mineral'?'':td('在庫品目',`<select data-row="invId" aria-label="${label} 在庫品目">${targetOptions(type,row.invId)}</select>`,'target-cell-wide');
  const second=td(`2回目の重さ${unit?'（'+unit+'）':''}`,qty('batch2'),'','data-second-brew');
  const total=td('合計','<output data-amount-total></output>');
  let details='';
  if(type==='fermentable')details=td('配合率','<output data-ratio aria-label="配合比率"></output>');
  if(type==='hop')details=td('α酸（%）',cell('alpha',m.alpha,true,true))+td('投入方法',`<select data-row="timingType" aria-label="${label} 投入方法"><option value="boil" ${row.timingType!=='dryhop'?'selected':''}>煮沸終了前</option><option value="dryhop" ${row.timingType==='dryhop'?'selected':''}>ドライホップ</option></select>`)+td('投入時期',cell('timingValue',row.timingValue,true))+td('IBU（自動計算）','<output data-target-ibu-output>入力待ち</output>');
  if(type==='adjunct'){details=td('投入工程',`<select data-row="timing" aria-label="${label} 投入工程">${['仕込み時','煮沸中','一次発酵中','二次発酵時','パッケージング時'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select>`);}
  if(type==='mineral')details=td('投入先',`<select data-row="timing" aria-label="${label} 投入先">${['仕込み水','スパージ水','煮沸中'].map(v=>`<option ${v===row.timing?'selected':''}>${v}</option>`).join('')}</select>`)+td('濃度（%）',cell('concentration',m.concentration,true,true));
  return `<tr data-target-row="${type}" data-base="${targetEsc(JSON.stringify(row))}">${td('名称',cell('name',row.name),'target-cell-wide')}${inventoryCell}${td(`重さ${unit?'（'+unit+'）':''}`,qty('batch1'))}${second}${total}${details}${td('操作',`<button type="button" class="inv-action-btn" data-remove-target-row aria-label="${label}の計画行を削除">削除</button>`)}</tr>`;
}
function targetRowHeaders(type,unit){
  const base=type==='mineral'?['名称']:['名称','在庫品目'];
  const quantities=['重さ'+(unit?'（'+unit+'）':''),'2回目の重さ'+(unit?'（'+unit+'）':'')];
  const end={fermentable:['合計','配合率'],hop:['合計','α酸（%）','投入方法','投入時期','IBU（自動計算）'],adjunct:['合計','投入工程'],mineral:['合計','投入先','濃度（%）']}[type];
  return [...base,...quantities,...end,'操作'].map((v,i)=>`<th ${i===base.length+1?'data-second-brew':''}>${v}</th>`).join('');
}
function targetRowsSection(type,b){
  const rows=b[BrewTargets.rowTypes[type][0]]||[],title=TARGET_ROW_LABELS[type],unit=BrewTargets.rowTypes[type][1];
  return targetSection(title, `<p class="target-note">数量は数字だけ入力してください${unit?`（例：100 ${unit}なら「100」）`:''}。</p><div class="target-table-scroll"><table class="target-material-table"><caption class="sr-only">${title}</caption><thead><tr>${targetRowHeaders(type,unit)}</tr></thead><tbody id="target-rows-${type}">${(rows.length?rows:[{name:'',amount:'',unit:'g',timingType:'boil'}]).map((r,i)=>targetRowHtml(type,r,i)).join('')}</tbody></table></div><div class="target-row-footer"><button type="button" class="inv-action-btn" data-add-target-row="${type}">＋ ${title}を追加</button><output id="target-total-${type}"></output></div>`);
}
function targetMetricHtml(step,key,b){
  const m=BrewTargets.metrics[key];if(m[2]==='bound'){
    const label=targetEsc(m[0])+(m[1]?'（'+targetEsc(m[1])+'）':'');
    if(['mashTemp','mashTime','boilTime'].includes(key))return `<div class="target-field"><label>${label}</label>${targetControl(`data-bound="${key}" aria-label="${targetEsc(step.name+' '+m[0])}"`,b[key]??'','number')}</div>`;
    return `<div class="target-field"><label>${label}</label><div class="target-bound-reference">${targetEsc(b[key]||'上の仕込み目標で設定')}</div></div>`;
  }
  const val=step.values[key]??'',label=m[0]+(m[1]?'（'+m[1]+'）':''),prefix=targetEsc(step.name+' '+label);
  const compare=m[2]==='number'&&['gravity','ph','volume'].includes(key)?`<select data-compare="${key}" aria-label="${prefix}の条件">${['=','<','<=','>','>='].map(op=>`<option value="${targetEsc(op)}" ${op===(step.comparisons?.[key]||'=')?'selected':''}>${targetEsc(op)}</option>`).join('')}</select>`:'';
  return `<div class="target-field"><label>${label}</label><div class="target-metric-input">${compare}${targetControl(`data-metric="${key}" aria-label="${prefix}"`,val,m[2])}${key==='gravity'?`<select data-gravity-unit aria-label="${prefix}の単位"><option ${step.gravityUnit==='SG'?'selected':''}>SG</option><option ${step.gravityUnit==='°P'?'selected':''}>°P</option></select>`:''}</div></div>`;
}
function targetStepGroup(step,keys,b,label){const fields=keys.filter(k=>step.slots.includes(k)).map(k=>targetMetricHtml(step,k,b)).join('');return `<td data-label="${label}">${fields||'<span class="target-empty-cell">—</span>'}</td>`;}
function targetActualSummary(step,b){
  const rows=(b.processMeasurements||[]).filter(row=>row.stage===step.name).sort((a,z)=>(a.date+' '+(a.time||'')).localeCompare(z.date+' '+(z.time||''))),latest=rows[rows.length-1];
  if(!latest)return 'まだ実績はありません。';
  const values=[latest.gravity!==''&&latest.gravity!=null?`比重 ${latest.gravity}`:'',latest.ph!==''&&latest.ph!=null?`pH ${latest.ph}`:'',latest.temperature!==''&&latest.temperature!=null?`温度 ${latest.temperature}℃`:'',latest.volume!==''&&latest.volume!=null?`液量 ${latest.volume}L`:''].filter(Boolean).join(' ／ ');
  return `${latest.date}${latest.time?' '+latest.time:''}　${values||'実測値なし'}`;
}
function targetStepActual(step,b){
  const saved=targetSheetBatchId&&batches.some(batch=>batch.id===targetSheetBatchId);
  return `<td class="target-mobile-actual" data-label="スマホ現場実績"><span>${targetEsc(saved?targetActualSummary(step,b):'仕込み計画を保存すると入力できます。')}</span>${saved?`<button type="button" class="btn btn-primary" data-target-process-actual="${targetEsc(targetSheetBatchId)}" data-target-process-stage="${targetEsc(step.name)}">この工程の実績を入力</button>`:''}</td>`;
}
function targetStepHtml(step,b,index=0){return `<tr class="target-step" data-step="${targetEsc(JSON.stringify(step))}"><td data-label="順番"><span class="target-step-number">${index+1}</span></td><td class="target-step-head" data-label="工程">${targetControl('data-step-name aria-label="工程名"',step.name)}</td>${targetStepGroup(step,['time'],b,'予定時刻')}${targetStepGroup(step,['duration','mashTime','boilTime'],b,'時間')}${targetStepGroup(step,['temp','mashTemp'],b,'温度')}${targetStepGroup(step,['volume'],b,'液量')}${targetStepGroup(step,['gravity','targetOG','plato'],b,'比重・糖度')}${targetStepGroup(step,['ph'],b,'pH')}${targetStepGroup(step,['flow','pressure','note'],b,'条件・備考')}${targetStepActual(step,b)}<td class="target-step-actions" data-label="操作"><button type="button" class="inv-action-btn" data-step-up aria-label="${targetEsc(step.name)}を上へ">↑</button><button type="button" class="inv-action-btn" data-step-down aria-label="${targetEsc(step.name)}を下へ">↓</button><button type="button" class="inv-action-btn" data-remove-target-step aria-label="${targetEsc(step.name)}を削除">削除</button></td></tr>`;}
function targetProcessSection(p,b){const steps=BrewTargets.expandedSteps(p);return targetSection('工程ごとの目標と実績',`<p class="target-note">PCで目標を設定します。保存後はスマートフォンで各工程のカードから比重・pH・温度・液量の実績を入力できます。</p><div class="target-table-scroll target-process-scroll"><table class="target-process-table"><thead><tr><th>順</th><th>工程</th><th>予定時刻</th><th>時間（分）</th><th>温度（℃）</th><th>液量（L）</th><th>比重・糖度</th><th>pH</th><th>流量・圧力・条件</th><th class="target-mobile-actual">実績</th><th>操作</th></tr></thead><tbody id="targetSteps">${steps.map((s,i)=>targetStepHtml(s,b,i)).join('')}</tbody></table></div><button type="button" class="add-row-btn" data-add-target-step>＋ 工程を追加（デコクション等）</button>`);}
function renderBrewTargetSheet(b){
  const p=BrewTargets.waterPlan(b.brewTargets,b.waterVolume);
  const extra=keys=>`<div class="target-field-grid">${keys.map(k=>targetExtra(k,p)).join('')}</div>`;
  const identities=targetSection('基本・設備',`<div class="target-field-grid">${['brewDate','brewer','batchSize'].map(k=>targetBound(k,b)).join('')}${targetTaxField(b)}${targetTankField(p)}${targetBatchNumberField(p)}${targetExtra('tradeName',p)}${targetExtra('productName',p)}</div><p class="target-note">酒税法上の品目区分は帳簿・課税移出CSVにも使用します。発酵タンクはFV1〜FV8から選ぶか、自由入力できます。</p>`);
  const water=targetSection('水量',`<div class="target-field-grid">${['mashWater1','mashWater2','spargeWater1','spargeWater2'].map(k=>targetSplitWaterField(k,p)).join('')}</div><p class="target-water-summary"><output id="target-water-total"></output></p>`);
  const yeast=targetSection('酵母',`<div class="target-field-grid">${targetYeastField(b)}${targetBound('yeastAmount',b)}${targetYeastSourceField(p)}${targetYeastInventoryField(b)}</div>`+extra(['yeastHarvestDate'])+`<p class="target-note">酵母の使用量はgで入力します。酵母名と由来は一覧から選ぶか、自由に入力できます。</p>`);
  const actualAbv=computedAbv(b.actualOG,b.fg);
  const results=targetSection('スタイル・目標・実績',`${targetStyleField(b)}<p class="target-note">上の参考範囲を見ながら、今回の仕込み目標を設定します。参考値が入力欄へ自動転記されることはありません。</p><div class="target-goal-actual"><div class="target-result-card"><h4>今回の目標</h4><div class="target-field-grid">${targetBound('targetOG',b)}${targetExtra('targetFG',p)}${targetAbvField(p)}${targetIbuField(p)}${targetSrmField(p)}</div></div><div class="target-result-card"><h4>実績</h4><div class="target-field-grid">${targetBound('actualOG',b)}${targetActualReference('実測FG',b.fg,'発酵管理の最新値')}${targetActualReference('実績ABV（%・自動計算）',actualAbv,'実測OGと実測FGから算出')}</div><p class="target-note">仕込み前は空欄でかまいません。実測値は目標仕込み表のExcelには書き出しません。</p></div></div>`);
  const hasSecond=p.fields.doubleBrew===true||['mashWater2','spargeWater2'].some(k=>p.fields[k]!==''&&p.fields[k]!=null)||Object.values(BrewTargets.rowTypes).some(([key])=>(b[key]||[]).some(r=>r.targetMeta?.batch2!==''&&r.targetMeta?.batch2!=null));
  document.getElementById('targetSheetBody').innerHTML=`<p class="operational-note">基本情報・原材料・水量と、仕込み工程の目標／実績を1つの仕込み表で管理します。</p><nav class="target-sheet-tabs" role="tablist" aria-label="仕込み計画の入力シート"><button type="button" role="tab" data-target-sheet-tab="basic">① 仕込み計画</button><button type="button" role="tab" data-target-sheet-tab="process">② 仕込み工程（目標／実績）</button></nav><div class="target-plan-status" id="targetPlanSummary" role="status"></div><div class="target-sheet-panes"><div data-target-sheet-pane="basic"><div class="target-basic-grid"><div class="target-basic-wide">${results}</div><div>${identities}</div><div><div class="target-double-brew"><label><input type="checkbox" id="targetDoubleBrew" ${hasSecond?'checked':''}>2回に分けて仕込み、同じ発酵タンクへまとめる</label><span>通常はオフのまま、1回分の重さだけ入力します。</span></div>${water}</div></div>${targetRowsSection('fermentable',b)}${targetRowsSection('hop',b)}${targetRowsSection('adjunct',b)}${yeast}</div><div data-target-sheet-pane="process">${targetProcessSection(p,b)}</div></div>`;
  document.getElementById('targetSheetTitle').textContent=targetSheetReadOnly?'仕込み計画（保存済み）':'仕込み計画';
  document.getElementById('targetSheetApply').hidden=targetSheetReadOnly;
  document.getElementById('targetSheetFooterNote').textContent=targetSheetReadOnly?'保存済みの仕込み計画です。スマートフォンでは工程カードから実績を入力できます。':'2つのシートの入力内容をまとめて保存します。';
  if(targetSheetReadOnly)document.querySelectorAll('#targetSheetBody input,#targetSheetBody select,#targetSheetBody button:not([data-target-sheet-tab]):not([data-target-process-actual])').forEach(e=>{e.disabled=true;if(e.tagName==='BUTTON')e.hidden=true;else if(e.tagName==='INPUT'&&!e.value)e.placeholder='未設定';});
  updateTargetSheetTotals();
  updateTargetStyleReference();
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
function updateSecondBrewView(){const body=document.getElementById('targetSheetBody'),checked=document.getElementById('targetDoubleBrew')?.checked===true;if(body){body.dataset.doubleBrew=String(checked);body.querySelectorAll('[data-water-split-label]').forEach(label=>{label.textContent=(checked?label.dataset.doubleLabel:label.dataset.singleLabel)+'（L）';});}}
function targetCurrentForm(){return buildBatchFromForm(editingId||'target-draft');}
function updateBrewPlanHubSummary(){
  const summary=document.getElementById('brewPlanHubSummary'),button=document.getElementById('brewPlanOpen');if(!summary||!button)return;
  const value=id=>document.getElementById(id)?.value?.trim()||'',name=value('f_batchName'),style=value('f_style'),date=value('f_brewDate');
  const materials=['fermentableRows','hopRows','adjunctRows','mineralRows'].reduce((count,id)=>count+[...(document.getElementById(id)?.children||[])].filter(row=>row.querySelector('input')?.value?.trim()).length,0)+(value('f_yeast')?1:0);
  const hasPlan=!!(brewTargetDraft||name||style||date||materials);
  summary.textContent=hasPlan?`バッチ：${name||'名称未設定'}　スタイル：${style||'未設定'}　予定日：${date||'未設定'}　原材料：${materials}品目`:'仕込み計画はまだ入力されていません。';
  button.textContent=hasPlan?'仕込み計画を確認・編集':'仕込み計画を入力';
}
function targetSheetIsInline(){return document.getElementById('targetSheetForm')?.dataset.presentation==='inline';}
function resetInlineBrewTargetSheet(){targetSheetDirty=false;targetSheetBefore='';targetSheetSnapshot='';pendingBrewTargetImport=null;}
function mountBrewTargetSheet(presentation){
  const form=document.getElementById('targetSheetForm'),host=presentation==='inline'?document.getElementById('targetSheetInline'):document.getElementById('targetSheetDialog');
  if(!form||!host)return false;
  if(form.parentElement!==host)host.appendChild(form);
  form.dataset.presentation=presentation;
  const cancel=document.getElementById('targetSheetCancel');
  if(cancel)cancel.textContent=presentation==='inline'?'キャンセル':'閉じる';
  return true;
}
function showInlineBrewTargetSheet(){
  if(targetSheetIsInline()&&targetSheetDirty)return;
  const b=targetCurrentForm();if(!b||!mountBrewTargetSheet('inline'))return;
  try{
    targetSheetReadOnly=false;targetSheetBatchId=editingId||'';targetSheetFocus=null;
    targetSheetBefore=JSON.stringify(b);targetSheetSnapshot=JSON.stringify(window.fermentCloudData.getSnapshot());
    renderBrewTargetSheet(b);targetSheetDirty=false;pendingBrewTargetImport=null;document.getElementById('targetExcelImportPreview').hidden=true;document.getElementById('targetSheetError').textContent='';
  }catch(e){document.getElementById('targetSheetError').textContent=e.message;}
}
function openBrewTargetSheet(savedId){
  if(!savedId){showInlineBrewTargetSheet();document.getElementById('targetSheetInline')?.scrollIntoView({block:'start'});return;}
  const dialog=document.getElementById('targetSheetDialog');if(dialog.open)return;
  const b=savedId?batches.find(x=>x.id===savedId):targetCurrentForm();if(!b)return;
  try{
    mountBrewTargetSheet('dialog');
    targetSheetReadOnly=!!savedId;targetSheetBatchId=savedId||editingId||'';targetSheetFocus=document.activeElement;
    targetSheetBefore=JSON.stringify(b);targetSheetSnapshot=JSON.stringify(window.fermentCloudData.getSnapshot());
    renderBrewTargetSheet(b);targetSheetDirty=false;pendingBrewTargetImport=null;document.getElementById('targetExcelImportPreview').hidden=true;document.getElementById('targetSheetError').textContent='';
    dialog.showModal();dialog.querySelector('.menu-close').focus({preventScroll:true});document.getElementById('targetSheetBody').scrollTop=0;syncModalState();
  }catch(e){alert(e.message);}
}
function closeBrewTargetSheet(){
  const dialog=document.getElementById('targetSheetDialog');if(!dialog?.open)return;
  if(!targetSheetReadOnly&&targetSheetDirty&&!confirm('仕込み計画で入力した未反映の変更を破棄しますか？'))return;
  dialog.close();
}
function cancelBrewTargetSheet(){if(targetSheetIsInline())cancelFromEditor();else closeBrewTargetSheet();}
function readTargetRows(type){return [...document.querySelectorAll(`#target-rows-${type} tr`)].map(tr=>{
  const row=JSON.parse(tr.dataset.base),meta={...row.targetMeta};
  tr.querySelectorAll('[data-row]').forEach(e=>row[e.dataset.row]=e.value);
  tr.querySelectorAll('[data-meta]').forEach(e=>meta[e.dataset.meta]=e.value);
  delete meta.manufacturer;delete meta.lot;delete meta.timingNote;
  if(type==='hop')meta.ibu=tr.dataset.autoIbu||'';
  if(type==='adjunct')row.unit='g';
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
function readBrewTargetSheetBatch(){
  const original=JSON.parse(targetSheetBefore),p=readTargetPlan(),bounds={};
  document.querySelectorAll('#targetSheetBody [data-bound]').forEach(e=>{
    const def=TARGET_BINDINGS.find(x=>x[0]===e.dataset.bound);
    if(!def)return;
    const range=TARGET_RANGES[def[0]]||[0,1e9];
    bounds[e.dataset.bound]=def[2]==='number'?BrewTargets.numeric(e.value,def[1],range[0],range[1]):e.value;
  });
  if((p.fields.mashWater1??'')!==''||(p.fields.mashWater2??'')!=='')bounds.waterVolume=BrewTargets.sum(p.fields.mashWater1,p.fields.mashWater2);
  else if(!Object.prototype.hasOwnProperty.call(bounds,'waterVolume'))bounds.waterVolume='';
  const rows={};for(const type of Object.keys(BrewTargets.rowTypes))rows[type]=readTargetRows(type);
  for(const type of ['fermentable','hop','adjunct'])for(const row of rows[type])if(row.invId){const item=inventory.find(i=>i.id===row.invId);if(!item||item.category!==type)throw Error(`${row.name}の在庫連携先を選び直してください。`);if(type==='adjunct'&&row.unit!==item.unit)throw Error(`${row.name}の単位を在庫の${item.unit}に合わせてください。`);}
  const yeastId=targetSheetReadOnly?(original.yeastInvId||''):(document.getElementById('targetYeastInventory')?.value||''),yeastItem=inventory.find(i=>i.id===yeastId);
  if(yeastId&&(!yeastItem||yeastItem.category!=='yeast'))throw Error('酵母の在庫連携先を選び直してください。');
  if(yeastItem&&yeastItem.unit!=='g')throw Error(`酵母の在庫単位はgにしてください（現在：${yeastItem.unit}）。`);
  return {...original,...bounds,yeastUnit:'g',brewTargets:p,fermentables:rows.fermentable,hops:rows.hop,adjuncts:rows.adjunct,minerals:[],yeastInvId:yeastId||undefined};
}
function applyBrewTargetSheet(event){
  event.preventDefault();if(targetSheetReadOnly)return false;
  const error=document.getElementById('targetSheetError');error.textContent='';
  try{
    if((!targetSheetIsInline()&&JSON.stringify(targetCurrentForm())!==targetSheetBefore)||JSON.stringify(window.fermentCloudData.getSnapshot())!==targetSheetSnapshot)throw Error('入力中に元の仕込み・クラウドデータが変わりました。変更内容を控え、開き直してください。');
    const target=readBrewTargetSheetBatch();
    document.querySelectorAll('#targetSheetBody [data-bound]').forEach(control=>{const key=control.dataset.bound,field=document.getElementById('f_'+key);if(field)field.value=target[key]??'';});
    document.getElementById('f_yeastUnit').value='g';
    document.getElementById('ph_waterVolume').value=target.waterVolume;
    for(const [type,[arrayKey]] of Object.entries(BrewTargets.rowTypes)){const container={fermentable:'fermentableRows',hop:'hopRows',adjunct:'adjunctRows',mineral:'mineralRows'}[type];document.getElementById(container).innerHTML='';target[arrayKey].forEach(row=>addRow(container,type,row));}
    brewTargetDraft=target.brewTargets;markEditorDirty();updateAbvDisplay();updateMineralContributionSummary();updateBrewPlanHubSummary();
    document.getElementById('targetPlanStatus').textContent='仕込み計画を保存しました。';
    targetSheetDirty=false;if(!targetSheetIsInline())document.getElementById('targetSheetDialog').close();
    return true;
  }catch(e){error.textContent=e.message;error.focus();return false;}
}
function exportBrewTargetWorkbook(){
  const error=document.getElementById('targetSheetError');error.textContent='';
  try{const filename=BrewTargetWorkbook.exportWorkbook(readBrewTargetSheetBatch(),inventory,{appVersion:APP_VERSION});document.getElementById('targetSheetFooterNote').textContent=`「${filename}」を書き出しました。`;}
  catch(e){error.textContent=e.message;error.focus();}
}
function renderBrewTargetImportPreview(result){
  pendingBrewTargetImport=result;const s=result.summary,preview=document.getElementById('targetExcelImportPreview');
  document.getElementById('targetExcelImportSummary').innerHTML=`<div class="target-import-summary"><span>バッチ：${targetEsc(s.batchName)}</span><span>予定日：${targetEsc(s.brewDate)}</span><span>原材料：${s.materialCount}品目</span><span>目標工程：${s.targetStepCount}件</span><span>${s.doubleBrew?'2回仕込み':'1回仕込み'}</span></div>`;
  document.getElementById('targetExcelImportWarnings').innerHTML=result.warnings.length?`<strong>確認してください</strong><ul>${result.warnings.map(message=>`<li>${targetEsc(message)}</li>`).join('')}</ul>`:'<p>現在の在庫と照合できた品目は連携済みで読み込みます。</p>';
  preview.hidden=false;preview.scrollIntoView({block:'nearest'});document.getElementById('targetExcelImportApply').focus();
}
async function importBrewTargetWorkbookFile(file){
  const error=document.getElementById('targetSheetError');error.textContent='';pendingBrewTargetImport=null;document.getElementById('targetExcelImportPreview').hidden=true;
  try{if(!file)return;if(file.size>5*1024*1024)throw Error('Excelファイルは5MB以内にしてください。');const result=BrewTargetWorkbook.parseWorkbook(await file.arrayBuffer(),inventory);renderBrewTargetImportPreview(result);}
  catch(e){error.textContent=`Excelを読み込めませんでした。${e.message}`;error.focus();}
}
function cancelBrewTargetImport(){pendingBrewTargetImport=null;document.getElementById('targetExcelImportPreview').hidden=true;document.getElementById('targetExcelImport').focus();}
function applyBrewTargetImport(){
  if(!pendingBrewTargetImport)return;const imported=JSON.parse(JSON.stringify(pendingBrewTargetImport.batch));pendingBrewTargetImport=null;targetSheetDirty=false;targetSheetFocus=null;if(document.getElementById('targetSheetDialog').open)document.getElementById('targetSheetDialog').close();
  openNewForm();populateFormFields(imported);renderFormInvDeductArea(null);markEditorDirty();document.getElementById('targetPlanStatus').textContent='Excelから新しい仕込み計画を読み込みました。内容を確認して保存してください。';showView('form',false);document.getElementById('targetSheetTitle').focus({preventScroll:true});
}
async function saveBrewTargetSheet(event){
  event.preventDefault();if(targetSheetReadOnly)return;
  const error=document.getElementById('targetSheetError'),button=document.getElementById('targetSheetApply');
  if(!document.getElementById('f_batchName').value.trim()){selectTargetSheet('basic');error.textContent='仕込みメニュー上部の「バッチ名」を入力してください。';error.focus();return;}
  button.disabled=true;button.textContent='保存中…';
  try{
    const applied=applyBrewTargetSheet({preventDefault(){}});
    if(applied)await saveBatch();
  }finally{
    button.disabled=false;button.textContent='保存';
  }
}
function updateTargetRowUnits(tr,type){
  const unit=BrewTargets.rowTypes[type][1];
  tr.querySelectorAll('[data-quantity-unit]').forEach(e=>e.textContent=unit||'単位未設定');
  tr.querySelectorAll('[data-quantity-label]').forEach(e=>e.setAttribute('aria-label',e.dataset.quantityLabel+'（'+(unit||'単位未設定')+'）'));
  return unit;
}
function updateTargetIbu(){
  const totalField=document.getElementById('target-extra-targetIBU');if(!totalField)return;
  const volume=document.getElementById('target-bound-batchSize')?.value||'',og=document.getElementById('target-bound-targetOG')?.value||'';let total=0,has=false;
  document.querySelectorAll('#target-rows-hop [data-target-row]').forEach(tr=>{
    const row={amount:tr.dataset.sum||'',timingType:tr.querySelector('[data-row=timingType]')?.value||'boil',timingValue:tr.querySelector('[data-row=timingValue]')?.value||'',targetMeta:{batch1:tr.querySelector('[data-meta=batch1]')?.value||'',batch2:tr.querySelector('[data-meta=batch2]')?.value||'',alpha:tr.querySelector('[data-meta=alpha]')?.value||''}},ibu=BrewTargets.hopIbu(row,volume,og),output=tr.querySelector('[data-target-ibu-output]');
    tr.dataset.autoIbu=ibu;if(ibu!==''){has=true;total+=Number(ibu);}if(output)output.textContent=row.timingType==='dryhop'&&row.amount!==''?'0.0（ドライホップ）':ibu===''?'入力待ち':ibu;
  });
  totalField.value=has?total.toFixed(1):'';
}
function applyTargetWaterProfile(key){
  const profiles={ro:{mCa:0,mMg:0,mNa:0,mCl:0,mSO4:0,mHCO3:0},balanced:{mCa:75,mMg:5,mNa:10,mCl:75,mSO4:75,mHCO3:25},hop:{mCa:100,mMg:5,mNa:10,mCl:50,mSO4:150,mHCO3:25},malt:{mCa:75,mMg:5,mNa:15,mCl:100,mSO4:50,mHCO3:50}},profile=profiles[key];
  if(!profile)return;for(const [field,value] of Object.entries(profile)){const input=document.getElementById('target-bound-'+field);if(input)input.value=value;}targetSheetDirty=true;updateTargetSheetTotals();
}
function calculateTargetWaterPhDose(){
  const result=document.getElementById('targetWaterPhResult'),value=key=>Number(document.getElementById('target-bound-'+key)?.value),volume=value('waterVolume'),currentPh=value('waterPh'),alkalinity=value('waterAlkalinity'),targetPh=value('targetWaterPh'),acidKey=document.getElementById('target-bound-phAcidType')?.value||'lactic88';
  const invalid=[];if(!(volume>0))invalid.push('糖化用水');if(!(currentPh>=4.5&&currentPh<=10))invalid.push('原水pH（4.5〜10）');if(!(alkalinity>0&&alkalinity<=500))invalid.push('アルカリ度（1〜500）');if(!(targetPh>=4.5&&targetPh<=7))invalid.push('目標pH（4.5〜7）');
  result.classList.remove('is-warning');if(invalid.length){result.classList.add('is-warning');result.textContent='入力を確認してください：'+invalid.join('、');return;}if(targetPh>=currentPh){result.classList.add('is-warning');result.textContent='目標pHは原水pHより低くしてください。この計算は酸でpHを下げる場合に使います。';return;}
  const state=ph=>{const h=10**-ph,oh=1e-14/h,ka1=10**-6.35,ka2=10**-10.33,d=h*h+ka1*h+ka1*ka2;return {h,oh,a1:ka1*h/d,a2:ka1*ka2/d};},initial=state(currentPh),target=state(targetPh),initialEq=alkalinity/50000,carbon=(initialEq-initial.oh+initial.h)/(initial.a1+2*initial.a2),targetEq=carbon*(target.a1+2*target.a2)+target.oh-target.h,meq=Math.max(0,(initialEq-targetEq)*volume*1000),acids=typeof WATER_ACIDS!=='undefined'?WATER_ACIDS:{lactic88:{name:'乳酸 88%',strength:11.81}},acid=acids[acidKey]||acids.lactic88,dose=meq/acid.strength;
  if(!Number.isFinite(dose)||dose<=0){result.classList.add('is-warning');result.textContent='この条件では添加量を算出できません。入力値を確認してください。';return;}
  const estimated=document.getElementById('target-bound-waterAlkalinity')?.dataset.estimated==='true',fraction=estimated?0.25:0.75,fmt=n=>n<10?n.toFixed(2):n.toFixed(1);result.innerHTML=`<strong>${targetEsc(acid.name)} 約 ${fmt(dose)} mL${estimated?'（仮計算）':''}</strong><br>最初は約 ${fmt(dose*fraction)} mL（${Math.round(fraction*100)}%）を加え、よく混ぜてpHを再測定してください。`;if(estimated)result.classList.add('is-warning');
}
function updateTargetMineralSummary(){
  const output=document.getElementById('targetMineralSummary');if(!output)return;const volume=Number(document.getElementById('target-bound-waterVolume')?.value),totals={mCa:0,mMg:0,mNa:0,mCl:0,mSO4:0,mHCO3:0};let has=false;
  document.querySelectorAll('#target-rows-mineral [data-target-row]').forEach(row=>{const name=row.querySelector('[data-row=name]')?.value.trim(),amount=Number(row.querySelector('[data-meta=batch1]')?.value||0)+Number(row.querySelector('[data-meta=batch2]')?.value||0),rule=typeof MINERAL_ADDITIVE_RULES!=='undefined'?MINERAL_ADDITIVE_RULES.find(item=>item.test(name||'')):null;if(!name||!(amount>0)||!rule?.ions)return;has=true;for(const [ion,fraction] of Object.entries(rule.ions))totals[ion]+=amount*1000*fraction/volume;});
  if(!(volume>0)){output.textContent='糖化用水を入力すると、添加前から添加後への変化を表示します。';return;}if(!has){output.textContent='添加剤を入力すると、原水から添加後への変化を表示します。';return;}
  const labels={mCa:'Ca',mMg:'Mg',mNa:'Na',mCl:'Cl',mSO4:'SO₄',mHCO3:'HCO₃'},source={mCa:'sCa',mMg:'sMg',mNa:'sNa',mCl:'sCl',mSO4:'sSO4',mHCO3:'sHCO3'},parts=[];for(const [ion,increase] of Object.entries(totals)){if(increase<=.01)continue;const sourceInput=document.getElementById('target-bound-'+source[ion]),known=sourceInput?.value!=='',before=Number(sourceInput?.value),goal=document.getElementById('target-bound-'+ion)?.value;parts.push(`${labels[ion]} ${known?before.toFixed(1)+' → '+(before+increase).toFixed(1):'原水不明 ＋'+increase.toFixed(1)} ppm${goal!==''?'（目標 '+goal+'）':''}`);}output.textContent=parts.join(' ／ ')||'計算できるミネラル添加剤がありません。';
}
function updateTargetSheetTotals(){
  updateTargetAbv();
  for(const type of Object.keys(BrewTargets.rowTypes)){
    const rows=[...document.querySelectorAll(`#target-rows-${type} tr`)];let total=0,has=false,invalid=false;
    rows.forEach(tr=>{const unit=updateTargetRowUnits(tr,type),a=tr.querySelector('[data-meta=batch1]').value,b=tr.querySelector('[data-meta=batch2]').value;try{const sum=BrewTargets.sum(BrewTargets.numeric(a,'量'),BrewTargets.numeric(b,'量'));tr.dataset.sum=sum;tr.querySelector('[data-amount-total]').textContent=sum===''?'合計 未設定':'合計 '+sum+' '+(unit||'（単位未設定）');if(sum!==''){has=true;total+=Number(sum);}}catch(e){tr.dataset.sum='';tr.querySelector('[data-amount-total]').textContent='数値を確認';invalid=true;}});
    const out=document.getElementById('target-total-'+type);if(out)out.textContent=invalid?'入力値を確認してください':has?`合計 ${Number(total.toFixed(6))} ${BrewTargets.rowTypes[type][1]}`:'合計 未設定';
    if(type==='fermentable')rows.forEach(tr=>tr.querySelector('[data-ratio]').textContent=total>0&&tr.dataset.sum!==''&&!invalid?(Number(tr.dataset.sum)/total*100).toFixed(1)+'%':'—');
  }
  const water=['[data-extra=mashWater1]','[data-extra=mashWater2]','[data-extra=spargeWater1]','[data-extra=spargeWater2]'].map(s=>document.querySelector('#targetSheetBody '+s)?.value||'');
  const mashTotal=document.getElementById('target-bound-waterVolume');if(mashTotal)try{mashTotal.value=BrewTargets.sum(BrewTargets.numeric(water[0],'糖化用水'),BrewTargets.numeric(water[1],'糖化用水'));}catch(e){mashTotal.value='';}
  const out=document.getElementById('target-water-total');if(out)try{out.textContent=water.every(v=>v==='')?'予定総水量 未設定':'予定総水量 '+water.map(v=>Number(BrewTargets.numeric(v,'水量'))).reduce((a,b)=>a+b,0).toFixed(2)+' L（糖化用水＋スパージ水）';}catch(e){out.textContent='水量を確認してください。';}
  updateTargetIbu();
  const summary=document.getElementById('targetPlanSummary');if(summary){const batch=document.getElementById('f_batchName')?.value.trim(),materials=[...document.querySelectorAll('[data-target-row] [data-row=name]')].filter(e=>e.value.trim()).length,goals=[...document.querySelectorAll('#targetSteps [data-metric]')].filter(e=>e.value!==''),filledSteps=new Set(goals.map(e=>e.closest('[data-step]'))).size;summary.textContent=`バッチ名：${batch?'入力済み':'未入力'}　原材料：${materials}品目　目標入力済み工程：${filledSteps}件`;}
  updateTargetMineralSummary();
}
document.addEventListener('DOMContentLoaded',()=>{
  const dialog=document.getElementById('targetSheetDialog'),body=document.getElementById('targetSheetBody');
  document.getElementById('targetSheetForm').addEventListener('submit',saveBrewTargetSheet);
  document.getElementById('targetExcelExport').addEventListener('click',exportBrewTargetWorkbook);
  document.getElementById('targetExcelImport').addEventListener('click',()=>document.getElementById('targetExcelFile').click());
  document.getElementById('targetExcelFile').addEventListener('change',event=>{const file=event.target.files?.[0];event.target.value='';importBrewTargetWorkbookFile(file);});
  document.getElementById('targetExcelImportCancel').addEventListener('click',cancelBrewTargetImport);
  document.getElementById('targetExcelImportApply').addEventListener('click',applyBrewTargetImport);
  document.addEventListener('click',e=>{const button=e.target.closest('[data-view-brew-targets]');if(button)openBrewTargetSheet(button.dataset.viewBrewTargets);});
  dialog.addEventListener('cancel',e=>{e.preventDefault();closeBrewTargetSheet();});
  dialog.addEventListener('close',()=>{syncModalState();targetSheetFocus?.focus();});
  body.addEventListener('input',e=>{targetSheetDirty=true;if(e.target.id==='target-bound-style')updateTargetStyleReference();if(e.target.id==='target-bound-yeast'){const linked=document.getElementById('targetYeastInventory'),item=inventory.find(i=>i.id===linked?.value);if(item&&item.name!==e.target.value)linked.value='';}updateTargetSheetTotals();});
  body.addEventListener('change',e=>{
    targetSheetDirty=true;const select=e.target;if(select.matches('[data-target-choice]')){syncTargetChoice(select,true);if(select.dataset.targetChoice==='style')updateTargetStyleReference();}if(select.id==='targetYeastInventory'&&select.value){const item=inventory.find(i=>i.id===select.value);if(item)setTargetChoiceValue('yeast',item.name);}if(select.id==='targetDoubleBrew'&&!select.checked){const second=[...body.querySelectorAll('[data-meta=batch2],[data-extra=mashWater2],[data-extra=spargeWater2]')].filter(i=>i.value!=='');if(second.length&&!confirm('仕込み2回目に入力済みの値があります。値を消して1回仕込みへ戻しますか？')){select.checked=true;}else second.forEach(i=>i.value='');updateSecondBrewView();}else if(select.id==='targetDoubleBrew')updateSecondBrewView();if(select.matches('[data-row=invId]')&&select.value){const item=inventory.find(i=>i.id===select.value),tr=select.closest('tr');if(item)tr.querySelector('[data-row=name]').value=item.name;}
    updateTargetSheetTotals();
  });
  body.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-target-sheet-tab')){selectTargetSheet(button.dataset.targetSheetTab);return;}
    if(button.hasAttribute('data-auto-batch-number')){document.getElementById('target-extra-batchNumber').value=suggestedBatchNumber();targetSheetDirty=true;updateTargetSheetTotals();return;}
    if(button.hasAttribute('data-target-process-actual')){if(targetSheetDirty){alert('先に仕込み計画を保存してください。');return;}const batchId=button.dataset.targetProcessActual,stage=button.dataset.targetProcessStage;if(document.getElementById('targetSheetDialog').open)document.getElementById('targetSheetDialog').close();openProcessEditor(batchId,null,stage);return;}
    if(targetSheetReadOnly)return;
    if(button.hasAttribute('data-add-target-row')){const type=button.dataset.addTargetRow,tb=document.getElementById('target-rows-'+type);tb.insertAdjacentHTML('beforeend',targetRowHtml(type,{name:'',amount:'',timingType:'boil'},tb.children.length));targetSheetDirty=true;}
    if(button.hasAttribute('data-remove-target-row')){const tr=button.closest('tr');if(!confirm('この予定行を仕込み計画から削除しますか？「仕込み計画を保存」するまでは記録に反映されません。'))return;tr.remove();targetSheetDirty=true;}
    if(button.hasAttribute('data-add-target-step')){const container=document.getElementById('targetSteps');if(container.children.length>=100){alert('工程は100行以内です。');return;}container.insertAdjacentHTML('beforeend',targetStepHtml({id:uid(),name:'追加工程',slots:['time','duration','temp','gravity','ph','volume','note'],values:{},gravityUnit:'SG',comparisons:{}},container.children.length));targetSheetDirty=true;}
    if(button.hasAttribute('data-remove-target-step')){if(!confirm('この工程を仕込み計画から削除しますか？'))return;button.closest('[data-step]').remove();targetSheetDirty=true;}
    if(button.hasAttribute('data-step-up')||button.hasAttribute('data-step-down')){const step=button.closest('[data-step]');if(button.hasAttribute('data-step-up')&&step.previousElementSibling)step.previousElementSibling.before(step);else if(button.hasAttribute('data-step-down')&&step.nextElementSibling)step.nextElementSibling.after(step);[...document.querySelectorAll('#targetSteps .target-step-number')].forEach((e,i)=>e.textContent=i+1);targetSheetDirty=true;button.focus();}
    updateTargetSheetTotals();
  });
});
