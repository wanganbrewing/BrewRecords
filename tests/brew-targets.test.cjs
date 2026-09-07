const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'..'),B=require('../brew-targets.js'),ui=fs.readFileSync(path.join(dir,'brew-targets-ui.js'),'utf8'),html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
function context(){const c=vm.createContext({BrewTargets:B,document:{addEventListener(){}},inventory:[],console,alert(){}});vm.runInContext(ui,c);return c;}
test('target templates are blank and cover the supplied brew sheet phases',()=>{
  const p=B.normalize(),steps=B.expandedSteps(p);assert.ok(steps.length>=40);assert.ok(Object.values(p.fields).every(v=>v===''));
  for(const id of ['rest1','rest2','rest3','mashOut','iodine','grant','flow','firstRun','lastRun','boilEnd','whirlpoolStart','knockoutEnd','aeration','yeastHydration','fermenterVolume','hltSet'])assert.ok(steps.some(s=>s.id===id));
  assert.ok(steps.every(s=>Object.keys(s.values).length===0));
});
test('blank and zero are distinct; numeric normalization rejects malformed input',()=>{
  assert.equal(B.numeric('','量'),'');assert.equal(B.numeric('０','量'),'0');assert.equal(B.numeric(' １．２５ ','量'),'1.25');
  for(const bad of ['NaN','Infinity','1e5','abc','-1','1000000001'])assert.throws(()=>B.numeric(bad,'量'));
  assert.equal(B.sum('',''),'');assert.equal(B.sum('0',''),'0');assert.equal(B.sum('.1','.2'),'0.3');
});
test('planned steps preserve units, comparison operators, repeated and custom stages',()=>{
  const p=B.empty();p.steps=[{id:'a',name:'Last run',slots:['gravity','ph','temp'],gravityUnit:'SG',values:{gravity:'1.012',ph:'5.8',temp:'0'},comparisons:{gravity:'<',ph:'<='}},{id:'b',name:'別鍋',slots:['gravity','volume'],gravityUnit:'°P',values:{gravity:'12.5',volume:'15'},comparisons:{}}];
  const n=B.normalize(p);assert.equal(n.steps[0].values.temp,'0');assert.equal(n.steps[0].comparisons.gravity,'<');assert.equal(n.steps[1].gravityUnit,'°P');assert.equal(n.steps[1].values.gravity,'12.5');
  assert.deepEqual(B.normalize(JSON.parse(JSON.stringify(n))),n);assert.equal(B.expandedSteps(n).length,2);
});
test('invalid pH, SG, duplicate stages, and unsupported schema fail without mutation',()=>{
  for(const values of [{ph:'14.1'},{gravity:'50'}]){const p={version:1,fields:{},steps:[{id:'a',name:'測定',slots:['ph','gravity'],values,gravityUnit:'SG'}]},before=JSON.stringify(p);assert.throws(()=>B.normalize(p));assert.equal(JSON.stringify(p),before);}
  assert.throws(()=>B.normalize({version:2,fields:{},steps:[]}));
  assert.throws(()=>B.normalize({version:1,fields:{},steps:[{id:'a',name:'A'},{id:'a',name:'B'}]}));
});
test('time, date and negative residual alkalinity are validated separately',()=>{
  const p={version:1,fields:{sanitizeDate:'2026-02-28',residualAlkalinity:'-38.1'},steps:[{id:'s',name:'Start',slots:['time'],values:{time:'09:15'}}]};
  assert.equal(B.normalize(p).fields.residualAlkalinity,'-38.1');p.fields.sanitizeDate='2026-02-30';assert.throws(()=>B.normalize(p));p.fields.sanitizeDate='';p.steps[0].values.time='25:00';assert.throws(()=>B.normalize(p));
});
test('batch 1 and 2 quantities sum once and keep hop alpha and calculated IBU data',()=>{
  const row={name:'Northern Brewer',invId:'hop-lot1',amount:'old',timingType:'boil',timingValue:'60',targetMeta:{batch1:'160',batch2:'20',manufacturer:'Maker',lot:'L1',alpha:'4.32',ibu:'2'}};
  const n=B.validateRow('hop',row);assert.equal(n.amount,'180');assert.equal(n.targetMeta.alpha,'4.32');assert.equal(n.invId,'hop-lot1');assert.equal(row.amount,'old');
  assert.throws(()=>B.validateRow('hop',{...row,targetMeta:{...row.targetMeta,alpha:'101'}}));
});
test('Tinseth IBU estimate uses hop weight, alpha, time, volume and target OG',()=>{
  const hop={name:'Cascade',amount:'900',timingType:'boil',timingValue:'60',targetMeta:{batch1:'800',batch2:'100',alpha:'6.2'}};
  assert.equal(B.hopIbu(hop,'280','1.050'),'46.0');assert.equal(B.hopIbu({...hop,timingType:'dryhop'},'280','1.050'),'0.0');assert.equal(B.hopIbu(hop,'','1.050'),'');
  const result=B.autoIbuRows([hop,{...hop,amount:'100',targetMeta:{batch1:'100',batch2:'',alpha:'5'}}],'280','1.050');assert.equal(result.total,'50.1');assert.equal(result.rows[0].targetMeta.ibu,'46.0');
});
test('ordinary amount edits reset only stale batch split while retaining target metadata',()=>{
  const old={batch1:'100',batch2:'20',alpha:'6.76',lot:'x'};
  assert.deepEqual(B.rowMeta({amount:'120',targetMeta:old}),old);
  const n=B.rowMeta({amount:'200',targetMeta:old});assert.equal(n.batch1,'200');assert.equal(n.batch2,'');assert.equal(n.alpha,'6.76');assert.equal(old.batch2,'20');
});
test('unit distinctions are retained; chemical concentration does not create a dosage calculation',()=>{
  assert.equal(B.validateRow('adjunct',{name:'ZnSO4',unit:'mg',targetMeta:{batch1:'950'}}).unit,'mg');
  const n=B.validateRow('mineral',{name:'H3PO4',timing:'スパージ水',targetMeta:{batch1:'30',concentration:'85'}});assert.equal(n.amount,'30');assert.equal(n.targetMeta.concentration,'85');
});
test('water splits reconcile with the canonical mash-water total without including sparge water',()=>{
  const plan=B.empty();plan.fields={mashWater1:'15',mashWater2:'5',spargeWater1:'30'};
  assert.equal(B.waterPlan(plan,'20').fields.mashWater2,'5');
  const changed=B.waterPlan(plan,'25');assert.equal(changed.fields.mashWater1,'25');assert.equal(changed.fields.mashWater2,'');assert.equal(changed.fields.spargeWater1,'30');
  const c=context();c.loadBrewTargetDraft({brewTargets:plan});c.document.getElementById=()=>({value:'25'});assert.equal(c.collectBrewTargets(null).fields.mashWater1,'25');assert.equal(plan.fields.mashWater1,'15');
});
test('second brew is explicit, optional and normalized to a boolean',()=>{
  const off=B.empty();assert.equal(B.normalize(off).fields.doubleBrew,false);
  const on=B.empty();on.fields.doubleBrew=true;assert.equal(B.normalize(on).fields.doubleBrew,true);
  const invalid=B.empty();invalid.fields.doubleBrew='true';assert.equal(B.normalize(invalid).fields.doubleBrew,false);
  assert.equal(B.fields.find(f=>f[0]==='mashWater1')[1],'糖化用水 仕込み1回目');
});
test('a metadata-only material cannot be silently discarded on ordinary form collection',()=>{
  assert.throws(()=>B.validateRow('hop',{name:'',timingType:'boil',targetMeta:{alpha:'6.7'}}),/名称/);
  assert.throws(()=>B.validateRow('fermentable',{name:'',targetMeta:{lot:'LOT1'}}),/名称/);
  assert.equal(B.validateRow('hop',{name:'',timingType:'boil',targetMeta:{}}).amount,'');
});
test('valid apply modifies only planned form fields and stages a plan until the ordinary save',()=>{
  const c=context(),source={id:'target-draft',batchName:'Before'},controls={targetSheetError:{focus(){}},f_yeastInv:{value:''},f_yeastUnit:{value:'g',options:[{value:'g'}]},f_batchName:{value:'Before'},f_waterVolume:{value:''},f_actualOG:{value:'1.051'},f_fg:{value:'1.010'},ph_waterVolume:{value:''},targetPlanStatus:{},targetSheetDialog:{close(){this.closed=true;}}};
  for(const id of ['fermentableRows','hopRows','adjunctRows','mineralRows'])controls[id]={innerHTML:'original'};
  c.document.getElementById=id=>controls[id];c.document.querySelectorAll=()=>[{dataset:{bound:'waterVolume'},value:'20'}];
  c.targetCurrentForm=()=>source;c.window={fermentCloudData:{getSnapshot:()=>({})}};c.readTargetPlan=()=>({version:1,fields:{tank:'FV2'},steps:[]});c.readTargetRows=()=>[];c.addRow=()=>{};
  let dirty=0;c.markEditorDirty=()=>dirty++;c.updateAbvDisplay=()=>{};c.updateMineralContributionSummary=()=>{};c.updateBatchIconSuggestion=()=>{};
  vm.runInContext('targetSheetBefore=JSON.stringify({id:"target-draft",batchName:"Before"});targetSheetSnapshot="{}";',c);
  c.applyBrewTargetSheet({preventDefault(){}});assert.equal(controls.targetSheetError.textContent,'');assert.equal(controls.f_batchName.value,'Before');assert.equal(controls.f_waterVolume.value,'20');assert.equal(controls.f_actualOG.value,'1.051');assert.equal(controls.f_fg.value,'1.010');assert.equal(controls.targetSheetDialog.closed,true);assert.equal(dirty,1);assert.equal(c.collectBrewTargets(null).fields.tank,'FV2');
});
test('scale copy changes volume goals and quantity splits but not source or pH/temperature',()=>{
  const c=context(),plan={version:1,fields:{spargeWater1:'25'},steps:[{id:'s',name:'Transfer',slots:['volume','temp','ph'],values:{volume:'20',temp:'14',ph:'5.3'}}]};
  const copy={brewTargets:JSON.parse(JSON.stringify(plan)),hops:[{name:'H',amount:'240',targetMeta:{batch1:'100',batch2:'20',alpha:'6.76'}}]};
  c.scaleBrewTargetCopy(copy,2);assert.equal(copy.brewTargets.fields.spargeWater1,'50');assert.equal(copy.brewTargets.steps[0].values.volume,'40');assert.equal(copy.brewTargets.steps[0].values.ph,'5.3');assert.equal(copy.hops[0].targetMeta.batch2,'40');assert.equal(copy.hops[0].targetMeta.batch1,'200');assert.equal(plan.fields.spargeWater1,'25');
});
test('loading, resetting and collecting plan drafts retains independent saved records',()=>{
  const c=context(),saved={brewTargets:B.empty()};saved.brewTargets.fields.tank='FV2';c.loadBrewTargetDraft(saved);const result=c.collectBrewTargets(saved);result.fields.tank='Changed';assert.equal(c.collectBrewTargets(saved).fields.tank,'FV2');assert.equal(saved.brewTargets.fields.tank,'FV2');c.resetBrewTargetDraft();assert.equal(c.collectBrewTargets(null),undefined);assert.equal(c.collectBrewTargets(saved).fields.tank,'FV2');
});
test('target row and step rendering escape names, metadata and values',()=>{
  const c=context(),attack='\"><img src=x onerror=alert(1)>';
  const row=c.targetRowHtml('fermentable',{name:attack,amount:'1',targetMeta:{manufacturer:attack}},0);assert.ok(!row.includes('<img'));assert.ok(row.includes('&lt;img'));
  const step=c.targetStepHtml({id:'x',name:attack,slots:['note'],values:{note:attack},comparisons:{}},{});assert.ok(!step.includes('<img'));
});
test('apply rejects stale form or cloud data before touching controls or saving',()=>{
  const c=context(),els={targetSheetError:{focus(){}}};c.document.getElementById=id=>els[id];c.targetCurrentForm=()=>({batchName:'Changed'});c.window={fermentCloudData:{getSnapshot:()=>({})}};
  vm.runInContext('targetSheetBefore=JSON.stringify({batchName:"Original"});targetSheetSnapshot="{}";',c);
  c.applyBrewTargetSheet({preventDefault(){}});assert.match(els.targetSheetError.textContent,/元の仕込み・クラウドデータが変わりました/);
});
test('unified target plan may assign the clearly labelled actual OG but never other fermentation or stock',()=>{
  new vm.Script(ui);new vm.Script(fs.readFileSync(path.join(dir,'brew-targets.js'),'utf8'));
  assert.ok(new RegExp("\\['actualOG',").test(ui));
  for(const field of ['fermentStart','fermentTemp','fermentStartPh','gravityLog','packages'])assert.ok(!new RegExp("\\['"+field+"',").test(ui));
  assert.match(ui,/今回の仕込み目標を設定/);assert.match(ui,/実測値は目標仕込み表のExcelには書き出しません/);
  assert.ok(!ui.includes('storage.set'));assert.ok(!ui.includes('deductInventoryForBatch('));
  assert.match(html,/brewTargets: typeof collectBrewTargets/);assert.match(html,/data-view-brew-targets/);assert.match(html,/目標仕込み表\(JSON\)/);
});
test('target assets are included in the application and offline cache',()=>{
  const v=JSON.parse(fs.readFileSync(path.join(dir,'version.json'),'utf8')).version;
  for(const file of ['index.html','sw.js'])for(const asset of ['brew-targets.js','brew-targets-ui.js','brew-targets.css'])assert.ok(fs.readFileSync(path.join(dir,file),'utf8').includes(`${asset}?v=${v}`));
});
test('planned quantity inputs display permanent units for both batches without changing stored values',()=>{
  const c=context();
  for(const [type,unit] of [['hop','g'],['fermentable','kg'],['mineral','g'],['adjunct','g']]){
    const row={name:'Material',amount:'1111',unit:'mg',targetMeta:{batch1:'1000',batch2:'111'}},before=JSON.stringify(row);
    const rendered=c.targetRowHtml(type,row,0);
    assert.equal((rendered.match(new RegExp('data-quantity-unit aria-hidden="true">'+unit+'<','g'))||[]).length,2);
    assert.match(rendered,/value="1000"/);assert.match(rendered,/value="111"/);assert.equal(JSON.stringify(row),before);
    assert.ok(!rendered.includes('value="1000 '+unit+'"'));
  }
  assert.match(c.targetRowsSection('hop',{}),/100 gなら「100」/);
  assert.match(c.targetRowsSection('hop',{}),/重さ（g）/);
  assert.match(c.targetRowsSection('hop',{}),/data-second-brew>2回目の重さ（g）/);
});
test('brewing plan and brewing process are separate main-menu workflows',()=>{
  const c=context(),source=c.renderBrewTargetSheet.toString()+c.saveBrewTargetSheet.toString();
  assert.ok(source.includes('大メニューの「仕込み工程」'));
  assert.ok(!source.includes('<nav class="target-sheet-tabs"'));
  assert.match(html,/data-tab="schedule"[^>]*>仕込み工程</);
  assert.match(html,/id="brewProcessPlan"/);
  assert.match(html,/id="brewProcessMobile"/);
  assert.match(ui,/function saveBrewProcessPlan/);
  assert.equal(JSON.stringify(c.brewProcessMeasurementKeys({slots:['time','temp','ph','note']})),JSON.stringify(['temperature','ph']));
  assert.match(html,/id="targetSheetApply">保存</);
  assert.doesNotMatch(source,/画面下部の「保存する」で確定/);
  assert.match(c.targetExtra('mashWater2',B.empty()),/data-second-brew/);
  assert.doesNotMatch(c.targetExtra('mashWater1',B.empty()),/data-second-brew/);
});
test('unified plan exposes the requested current fields and omits retired input controls',()=>{
  for(const key of ['taxCategory','actualOG'])assert.match(ui,new RegExp("\\['"+key+"',"));
  assert.ok(ui.includes("'targetSRM'"));
  for(const key of ['batchIcon','waterSource','waterPh','waterAlkalinity','targetWaterPh','phAcidType','sCa','sMg','sNa','sCl','sSO4','sHCO3'])assert.doesNotMatch(ui,new RegExp("\\['"+key+"',"));
  assert.doesNotMatch(ui,/cellDensity|細胞密度/);
  for(const text of ['スタイル・目標・実績','スタイルを選ぶと参考値を表示します','酵母の使用量はgで入力します','この工程の実績を入力','酒税法上の品目区分','FV1〜FV8','目標IBU（自動計算）'])assert.ok(ui.includes(text));
  for(const text of ['原水とpH調整','酸の添加量を計算','水質調整剤の予定量'])assert.ok(!ui.includes(text));
  assert.ok(html.includes('id="targetSheetInline" class="target-sheet-inline"'));
  assert.ok(html.includes('class="form-batch-name brew-batch-visible"'));
  assert.ok(html.includes('id="legacyBrewInputs" hidden aria-hidden="true"'));
  assert.match(ui,/target-material-section target-yeast-section/);
  assert.match(ui,/<th>酵母名<\/th><th>在庫品目<\/th><th>使用量（g）<\/th>/);
  const rendered=ui.slice(ui.indexOf('function renderBrewTargetSheet'));
  assert.ok(rendered.indexOf("targetRowsSection('fermentable',b)")<rendered.indexOf("targetRowsSection('hop',b)"));
  assert.ok(rendered.indexOf("targetRowsSection('hop',b)")<rendered.indexOf('${yeast}'));
  assert.ok(rendered.indexOf('${yeast}')<rendered.indexOf("targetRowsSection('adjunct',b)"));
});
test('selection helpers keep reference values separate and calculate target ABV',()=>{
  const c=context();
  assert.equal(c.computedAbv('1.050','1.010'),'5.3');assert.equal(c.computedAbv('1.010','1.050'),'');assert.equal(c.computedAbv('','1.010'),'');
  const tax=c.targetTaxField({taxCategory:'ビール'});assert.match(tax,/<select[^>]+data-bound="taxCategory"/);assert.match(tax,/value="ビール" selected/);
  const tank=c.targetTankField({fields:{tank:'FV3'}});assert.match(tank,/FV3/);assert.match(tank,/data-extra="tank"[^>]+hidden/);
  const srm=c.targetSrmField({fields:{targetSRM:'8'}});assert.match(srm,/SRM 8/);assert.match(srm,/data-extra="targetSRM"[^>]+hidden/);
  assert.match(c.targetRowHtml('hop',{name:'Cascade',targetMeta:{}},0),/data-label="α酸（%）"/);
  assert.match(ui,/スタイルガイド参考値（入力値ではありません）/);assert.doesNotMatch(ui,/\$\{targetEsc\(style\.id\)\} \$\{targetEsc\(style\.name\)\}/);
});
test('adjunct quantities use a fixed gram weight without a separate unit input',()=>{
  const c=context(),badges=[{},{}],inputs=[{value:'1000',dataset:{quantityLabel:'副原料1 重さ'},setAttribute(k,v){this[k]=v;}},{value:'111',dataset:{quantityLabel:'副原料1 2回目の重さ'},setAttribute(k,v){this[k]=v;}}];
  const row={querySelectorAll:s=>s==='[data-quantity-unit]'?badges:inputs};
  assert.equal(c.updateTargetRowUnits(row,'adjunct'),'g');assert.ok(badges.every(e=>e.textContent==='g'));assert.equal(inputs[0]['aria-label'],'副原料1 重さ（g）');
  const rendered=c.targetRowHtml('adjunct',{name:'Sugar',amount:'10',unit:'mg',targetMeta:{batch1:'10'}},0);assert.doesNotMatch(rendered,/data-row="unit"/);assert.match(rendered,/重さ（g）/);
});
