const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../display-controls.js'),'utf8');
test('consumable reference price UI is removed',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(!html.includes('id="costCatalogPanel"'));
  assert.ok(!html.includes('id="catalogDialog"'));
  assert.ok(!html.includes('id="expenseCatalogSelect"'));
});
test('item categories use desktop spreadsheet tables in the wide inventory layout',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../ui-polish.css'),'utf8');
  assert.ok(html.includes("document.body.classList.toggle('inventory-wide',!$('viewInventory').hidden);"));
  assert.ok(html.includes("document.body.classList.toggle('inventory-wide',name==='inventory');"));
  assert.ok(html.includes('#inv_fermentable,#inv_hop,#inv_yeast,#inv_adjunct{display:block;}'));
  assert.ok(html.includes('class="inventory-table-scroll inventory-category-sheet"'));
  assert.ok(html.includes('<table class="inventory-table" aria-label="${escapeHtml(INV_CATEGORY_LABEL[cat])}の品目一覧"><thead>'));
  assert.ok(!html.includes('<caption>${escapeHtml(INV_CATEGORY_LABEL[cat])}在庫</caption>'));
  assert.equal((html.match(/<details class="inventory-group" open>/g)||[]).length,4);
  assert.ok(html.includes('<td class="inventory-action-cell"><div class="inv-card-actions inventory-sheet-actions">'));
  assert.ok(css.includes('.inventory-sheet-actions{margin:0;min-width:max-content;flex-wrap:nowrap;}'));
  assert.ok(css.includes('.inventory-sheet-actions .inv-action-danger{margin-left:0;}'));
  assert.ok(html.includes('id="inventoryViewMode"'));
});
test('month-end valuation follows all inventory views without duplicating the panel',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.equal((html.match(/id="valuationPanel"/g)||[]).length,1);
  assert.ok(html.indexOf('id="valuationPanel"')>html.indexOf('id="inv_addform_adjunct"'));
  assert.ok(html.indexOf('id="valuationPanel"')<html.indexOf('<!-- inventoryCards / viewInventory -->'));
});
test('mobile inputs include wide phones and month/search controls with adequate delete targets',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('@media(max-width:700px){'));
  assert.ok(html.includes('input[type=month],input[type=number],input[type=time],input[type=datetime-local],textarea,select{font-size:16px;min-height:44px;}'));
  assert.ok(html.includes('.icon-btn{width:44px;min-width:44px;height:44px;}'));
  assert.ok(html.includes('.dyn-row,.dyn-subrow{flex-wrap:wrap;gap:8px;}'));
  assert.ok(html.includes('id="targetSheetInline"'));
  assert.ok(!html.includes('id="brewPlanOpen"'));
  assert.ok(!html.includes('id="entryModeSimple"'));
});
test('guide matches unified brewing plan and current menu labels',()=>{
  const help=fs.readFileSync(path.join(__dirname,'../help.html'),'utf8');
  assert.ok(!help.includes('消耗品・参考単価'));
  assert.ok(help.includes('発酵管理からの参照値'));
  assert.ok(help.includes('スマホは今回の工程を1つ選び'));
  assert.ok(help.includes('日本地ビール協会の2024年4月ガイドライン'));
  assert.ok(help.includes('クラウド同期の設定・状態確認'));
  assert.ok(help.includes('メニューや詳細項目が見つからない'));
  assert.ok(!help.includes('「クラウド同期を設定」'));
  assert.ok(!help.includes('<h2>PCで複数の情報を確認する</h2>'));
});
test('dynamic number controls associate field names before button enhancement',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const fn=html.split('function enhanceNumberInputs(root){')[1];
  assert.ok(fn.indexOf('ensureAccessibleLabels(scope);')<fn.indexOf('scope.querySelectorAll'));
  assert.ok(html.includes('control.id = `field-control-${uid()}`'));
});
test('narrow phones keep fermentation metrics readable with 44px step controls',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('.gravity-entry .number-step-button{min-width:44px;min-height:44px;}'));
  assert.ok(html.includes('@media(max-width:420px){\n  .gravity-entry{grid-template-columns:minmax(0,1fr);}')||html.includes('@media(max-width:420px){\r\n  .gravity-entry{grid-template-columns:minmax(0,1fr);}'));
  const help=fs.readFileSync(path.join(__dirname,'../help.html'),'utf8');
  assert.ok(!help.includes('月末の棚卸金額の自動保存はまだ対象外'));
});
test('desktop fermentation measurements fit date, five values and delete on one row',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('.gravity-entry{grid-template-columns:minmax(145px,1.1fr) repeat(5,minmax(0,1fr)) 44px;align-items:end;}'));
  assert.ok(html.includes('.gravity-entry .gravity-date-field{display:contents;}'));
  assert.ok(html.includes('.gravity-entry .gravity-date-field>.icon-btn{grid-column:7;grid-row:1;'));
  assert.ok(html.includes('class="fermentation-table-head"'));
  assert.ok(html.includes('class="rg-volume"'));
  assert.ok(html.includes("volume:r.querySelector('.rg-volume')?.value||''"));
  assert.ok(html.includes("g.volume?' ・ '+g.volume+' L':''"));
  assert.ok(html.includes('#ferm_content.desktop-workspace:not([hidden]){display:block;}'));
});
test('fermentation combines daily measurements and finishing values without a separate info panel',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(!html.includes('id="fermentationInfoPanel"'));
  assert.ok(!html.includes('<div class="section-title">発酵情報</div>'));
  assert.ok(html.includes('<span class="fermentation-summary-label">OG</span>'));
  assert.ok(!html.includes('<span class="fermentation-summary-label">FG</span>'));
  assert.ok(html.includes('id="fermentationMeasurementsPanel"'));
  assert.ok(!html.includes('id="fm_fg"'));
  assert.ok(!html.includes('id="fm_co2vol"'));
  assert.ok(html.includes('class="rg-co2"'));
  assert.ok(html.includes('b.fg = latestGravity;'));
  assert.ok(html.includes('#fermentationMeasurementsPanel{grid-column:1/-1;grid-row:2;}'));
});
test('brewing plan replaces the basic/detail split and packaging is a separate screen',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../brew-targets.css'),'utf8');
  assert.ok(html.includes('id="targetSheetInline" class="target-sheet-inline"'));
  assert.ok(!html.includes('id="brewPlanHubTitle"'));
  assert.ok(css.includes('.target-material-table{display:table;width:100%;min-width:0;'));
  assert.ok(css.includes('.target-material-table tr{display:table-row'));
  assert.ok(css.includes('.target-material-table thead{display:table-header-group;}'));
  assert.ok(css.includes('.target-material-section{margin-bottom:10px;padding:0;'));
  assert.ok(css.includes('.target-yeast-table{table-layout:fixed;}'));
  assert.ok(html.includes('id="legacyBrewInputs" hidden aria-hidden="true"'));
  assert.ok(html.includes('id="viewPackaging" hidden'));
  assert.ok(html.includes('id="packagingEntryPanel"'));
  assert.ok(html.includes('class="packaging-table"'));
  assert.ok(html.includes("row.className = 'package-entry'"));
  assert.ok(html.includes('class="rp-row-total"'));
  assert.ok(html.includes('#pkg_content.desktop-workspace:not([hidden]){display:block;}'));
  assert.ok(!html.includes('仕込み後に追記する情報'));
  assert.ok(!html.includes('data-entry-mode='));
  assert.ok(!html.includes('id="entryModeDetail"'));
  assert.ok(!source.includes('setEntryMode'));
});
test('desktop fermentation and record history use full-width table-like rows',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('class="record-table-head"'));
  assert.ok(html.includes('.record-table-head,.record-cards .batch-card{grid-template-columns:'));
  assert.ok(html.includes('.record-cards{display:block;border:1px solid var(--border);'));
  assert.ok(!html.includes('.record-cards{grid-template-columns:repeat(2,minmax(0,1fr));}'));
  assert.ok(html.includes('grid-template-columns:repeat(6,minmax(0,1fr));gap:0;'));
});
test('yeast inventory uses grams and the last selected batch is restored',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes("const INV_DEFAULT_UNIT = {fermentable:'kg', hop:'g', yeast:'g'};"));
  assert.ok(html.includes("if(category==='adjunct'){"));
  assert.ok(html.includes('value="g" readonly aria-label="酵母の在庫単位"'));
  assert.ok(!html.includes('const yeastUnitOptions'));
  assert.ok(html.includes("const LAST_SELECTED_BATCH_KEY = 'wangan-last-selected-batch';"));
  assert.ok(html.includes('await restoreSelectedBatch();'));
  assert.ok(html.includes('const preferredId = selectedId || lastViewedBatchId;'));
  assert.ok(html.includes('const preferredId=selectedId||lastViewedBatchId;'));
  assert.ok(html.includes('rememberSelectedBatch(id);'));
});
test('brewing process has separate desktop plan and one-step mobile input',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const css=fs.readFileSync(path.join(__dirname,'../brew-targets.css'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../brew-targets-ui.js'),'utf8');
  for(const id of ['viewSchedule','brewProcessPlan','brewProcessMobile','fermentationMeasurementsPanel'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
  assert.ok(css.includes('@media(max-width:999px){.brew-process-desktop{display:none;}.brew-process-mobile{display:block;'));
  assert.ok(ui.includes('id="brewProcessStepSelect"'));
  assert.ok(ui.includes('今回の入力対象'));
  assert.ok(ui.includes('fieldKeys:brewProcessMeasurementKeys(step),lockStage:true'));
});
test('desktop process targets fit the notebook width without horizontal scrolling',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../brew-targets.css'),'utf8');
  const ui=fs.readFileSync(path.join(__dirname,'../brew-targets-ui.js'),'utf8');
  assert.ok(ui.includes('class="target-table-scroll target-process-scroll"'));
  assert.ok(css.includes('.target-process-scroll{overflow-x:visible;}'));
  assert.ok(css.includes('.target-process-table{table-layout:fixed;min-width:0;}'));
  assert.ok(css.includes('.target-process-table input,#targetSheetBody .target-process-table select{height:34px;min-height:34px'));
  assert.ok(css.includes('.target-process-table th:nth-child(3){width:10%;}'));
  assert.ok(css.includes('input[type="time"]::-webkit-calendar-picker-indicator{width:14px;height:14px'));
  assert.ok(css.includes('.target-process-table th:nth-child(11){width:9%;}'));
  assert.ok(css.includes('.target-process-table .target-metric-input{flex-wrap:wrap;gap:3px;}'));
});
test('brewing, schedule, fermentation and packaging use wide layout only in their own views',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const view of ['form','schedule','fermentation','packaging'])assert.ok(html.includes(`document.body.classList.toggle('${view}-wide',name==='${view}');`));
  assert.ok(html.includes('@media(min-width:1000px){body.inventory-wide .wrap,body.form-wide .wrap,body.schedule-wide .wrap,body.fermentation-wide .wrap,body.packaging-wide .wrap{max-width:1400px;}}'));
});
test('five core navigation items stay visible and only packaging is optional',()=>{
  const tabs={packaging:{hidden:true}},fields={},store=new Map();let count,redirect;
  const c=vm.createContext({localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{addEventListener(){},querySelector:s=>tabs[s.match(/data-tab="([^"]+)/)?.[1]],documentElement:{style:{setProperty:(k,v)=>count=v}}},$:id=>fields[id]||(fields[id]={}),currentTab:'inventory',showView:(...a)=>redirect=a});vm.runInContext(source,c);
  assert.equal(c.preferredOptionalNavigation().packaging,false);c.setOptionalNavigation('schedule',true);assert.equal(count,undefined);
  c.setOptionalNavigation('packaging',true);assert.equal(count,'6');assert.equal(c.preferredOptionalNavigation().packaging,true);c.currentTab='packaging';c.setOptionalNavigation('packaging',false);assert.equal(redirect[0],'inventory');assert.equal(count,'5');store.set('ferment-optional-navigation-v1','bad');assert.equal(c.preferredOptionalNavigation().packaging,false);
});
test('obsolete entry-mode preference and controls are removed',()=>{
  assert.ok(!source.includes('ferment-entry-mode-v2'));
  assert.ok(!source.includes('preferredEntryMode'));
  assert.ok(!source.includes('setEntryMode'));
});
test('legacy form controls remain as one hidden data adapter and are never disabled',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const id of ['f_batchName','f_taxCategory','f_actualOG','f_waterSource','f_targetWaterPh','fermentableRows','hopRows','yeastEntry'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
  assert.ok(html.includes('id="legacyBrewInputs" hidden aria-hidden="true"'));
  assert.ok(!source.includes('.disabled='));
});
function harness(wide=true,value=null){const els=new Map(),cards=[{dataset:{batchId:'a'}},{dataset:{batchId:'b'}}];let saved=value;const c=vm.createContext({localStorage:{getItem:()=>saved,setItem:(key,v)=>saved=v},matchMedia:()=>({matches:wide}),document:{addEventListener(){},querySelectorAll:()=>cards},$:id=>{if(!els.has(id))els.set(id,{});return els.get(id);},statusOf:b=>b.status,escapeHtml:s=>String(s).replaceAll('"','&quot;'),batches:[{id:'a',batchName:'湾岸 IPA',style:'IPA',status:'発酵中'},{id:'b',batchName:'Porter',status:'完了'}]});vm.runInContext(source,c);c.run=s=>vm.runInContext(s,c);c.cards=cards;c.saved=()=>saved;return c;}
test('inventory opens category tables by default and remembers a later selection',()=>{assert.equal(harness().preferredInventoryMode(),'cards');assert.equal(harness(false).preferredInventoryMode(),'cards');for(const mode of ['cards','stock','ledger'])assert.equal(harness(true,mode).preferredInventoryMode(),mode);const c=harness(false,'bad');assert.equal(c.preferredInventoryMode(),'cards');c.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(c.preferredInventoryMode(),'cards');c.rememberInventoryMode('ledger');assert.equal(c.saved(),'ledger');c.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>c.rememberInventoryMode('cards'));assert.ok(source.includes("ferment-inventory-view-v2"));});
test('record filtering normalizes width/case, matches all terms and status, without changing records',()=>{const c=harness(),before=JSON.stringify(c.batches);assert.equal(c.recordMatches(c.batches[0],'湾岸 ＩＰＡ','発酵中'),true);assert.equal(c.recordMatches(c.batches[0],'ipa','完了'),false);c.run('recordSearch="IPA"');c.applyRecordFilters();assert.equal(c.cards[0].hidden,false);assert.equal(c.cards[1].hidden,true);assert.equal(c.$('recordFilterCount').textContent,'1件 / 全2件');c.run('recordSearch="missing"');c.applyRecordFilters();assert.equal(c.$('recordNoMatches').hidden,false);c.clearRecordFilters();assert.equal(c.cards[1].hidden,false);assert.equal(JSON.stringify(c.batches),before);});
test('search form preserves escaped input and release caches its script',()=>{const c=harness();c.run('recordSearch=\'" onfocus="bad\'');assert.match(c.recordFiltersHtml(),/&quot;/);const dir=path.join(__dirname,'..'),v=JSON.parse(fs.readFileSync(path.join(dir,'version.json'),'utf8')).version;for(const file of ['index.html','sw.js'])assert.ok(fs.readFileSync(path.join(dir,file),'utf8').includes(`display-controls.js?v=${v}`));});
