const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../display-controls.js'),'utf8');
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
  assert.ok(html.includes('#viewForm[data-entry-mode="detail"] #basicEntryGuide{display:none;}'));
});
test('guide matches separated detail navigation and current menu labels',()=>{
  const help=fs.readFileSync(path.join(__dirname,'../help.html'),'utf8');
  assert.ok(help.includes('仕込み → 詳細 → 消耗品・参考費用'));
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
test('basic and detail sections are mutually exclusive while shared identity and save remain visible',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('#viewForm[data-entry-mode="detail"]>details.section:not([data-entry-advanced])'));
  assert.ok(html.includes('#viewForm[data-entry-mode="detail"]>#formInvDeductArea{display:none!important;}'));
  assert.ok(html.includes('#viewForm[data-entry-mode="simple"]>[data-entry-advanced]{display:none!important;}'));
  assert.ok(!source.split('function setEntryMode(')[1].split("document.addEventListener")[0].includes('.value='));
  assert.ok(source.includes('基本・詳細をまとめて保存'));
});
test('desktop parallel panels preserve hidden empty states and span timelines and save actions',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  assert.ok(html.includes('@media(min-width:1200px)'));
  assert.ok(html.includes('.desktop-workspace:not([hidden]){display:grid;'));
  assert.ok(html.includes('.desktop-workspace>*{grid-column:1/-1;min-width:0;}'));
  for(const id of ['scheduleBatchPanel','scheduleStepsPanel','fermentationInfoPanel','fermentationMeasurementsPanel'])assert.equal((html.match(new RegExp(`id="${id}"`,'g'))||[]).length,1);
});
test('brewing, schedule and fermentation use wide layout only on desktop and in their own views',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  for(const view of ['form','schedule','fermentation'])assert.ok(html.includes(`document.body.classList.toggle('${view}-wide',name==='${view}');`));
  assert.ok(html.includes('@media(min-width:1000px){body.inventory-wide .wrap,body.form-wide .wrap,body.schedule-wide .wrap,body.fermentation-wide .wrap{max-width:1400px;}}'));
});
test('optional navigation defaults off, remembers independent choices and redirects hidden active view',()=>{
  const tabs={schedule:{hidden:true},fermentation:{hidden:true}},fields={},store=new Map();let count,redirect;
  const c=vm.createContext({localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},document:{addEventListener(){},querySelector:s=>tabs[s.includes('schedule')?'schedule':'fermentation'],documentElement:{style:{setProperty:(k,v)=>count=v}}},$:id=>fields[id]||(fields[id]={}),currentTab:'inventory',showView:(...a)=>redirect=a});vm.runInContext(source,c);
  assert.equal(c.preferredOptionalNavigation().schedule,false);c.setOptionalNavigation('schedule',true);assert.equal(count,'4');assert.equal(tabs.fermentation.hidden,true);assert.equal(c.preferredOptionalNavigation().schedule,true);
  c.setOptionalNavigation('fermentation',true);assert.equal(count,'5');c.currentTab='schedule';c.setOptionalNavigation('schedule',false);assert.equal(redirect[0],'inventory');assert.equal(count,'4');c.setOptionalNavigation('fermentation',false);assert.equal(count,'3');store.set('ferment-optional-navigation-v1','bad');assert.equal(c.preferredOptionalNavigation().schedule,false);
});
test('entry mode changes presentation only, preserves values and remembers choice safely',()=>{
  const fields=new Map(),store=new Map();const c=vm.createContext({document:{addEventListener(){}},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},$:id=>{if(!fields.has(id))fields.set(id,{dataset:{},value:'keep',open:true,setAttribute(k,v){this[k]=v;}});return fields.get(id);}});vm.runInContext(source,c);
  assert.equal(c.preferredEntryMode(),'simple');c.setEntryMode('simple');assert.equal(c.preferredEntryMode(),'simple');assert.equal(c.$('viewForm').dataset.entryMode,'simple');assert.equal(c.$('entryModeSimple')['aria-pressed'],'true');assert.match(c.$('entryModeNote').textContent,/保持/);
  c.setEntryMode('detail');assert.equal(c.$('viewForm').dataset.entryMode,'detail');for(const field of fields.values()){assert.equal(field.value,'keep');assert.equal(field.open,true);}
  c.setEntryMode('invalid');assert.equal(c.$('viewForm').dataset.entryMode,'detail');c.localStorage.setItem=()=>{throw Error('blocked');};assert.doesNotThrow(()=>c.setEntryMode('simple'));c.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(c.preferredEntryMode(),'simple');
});
test('only the three optional brewing sections are hidden and never disabled',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');assert.equal((html.match(/<details class="section" data-entry-advanced>/g)||[]).length,3);for(const title of ['水質調整','パッケージング','消耗品・参考費用'])assert.ok(new RegExp('<details class="section" data-entry-advanced>\\s*<summary[^>]*>'+title).test(html));assert.ok(html.includes('#viewForm[data-entry-mode="simple"]>[data-entry-advanced]'));assert.ok(!source.includes('.disabled='));
});
function harness(wide=true,value=null){const els=new Map(),cards=[{dataset:{batchId:'a'}},{dataset:{batchId:'b'}}];let saved=value;const c=vm.createContext({localStorage:{getItem:()=>saved,setItem:(key,v)=>saved=v},matchMedia:()=>({matches:wide}),document:{addEventListener(){},querySelectorAll:()=>cards},$:id=>{if(!els.has(id))els.set(id,{});return els.get(id);},statusOf:b=>b.status,escapeHtml:s=>String(s).replaceAll('"','&quot;'),batches:[{id:'a',batchName:'湾岸 IPA',style:'IPA',status:'発酵中'},{id:'b',batchName:'Porter',status:'完了'}]});vm.runInContext(source,c);c.run=s=>vm.runInContext(s,c);c.cards=cards;c.saved=()=>saved;return c;}
test('initial inventory view uses width only without a valid saved choice; errors fall back safely',()=>{assert.equal(harness().preferredInventoryMode(),'stock');assert.equal(harness(false).preferredInventoryMode(),'cards');for(const mode of ['cards','stock','ledger'])assert.equal(harness(true,mode).preferredInventoryMode(),mode);const c=harness(false,'bad');assert.equal(c.preferredInventoryMode(),'cards');c.localStorage.getItem=()=>{throw Error('blocked');};assert.equal(c.preferredInventoryMode(),'cards');c.rememberInventoryMode('ledger');assert.equal(c.saved(),'ledger');c.localStorage.setItem=()=>{throw Error('quota');};assert.doesNotThrow(()=>c.rememberInventoryMode('cards'));});
test('record filtering normalizes width/case, matches all terms and status, without changing records',()=>{const c=harness(),before=JSON.stringify(c.batches);assert.equal(c.recordMatches(c.batches[0],'湾岸 ＩＰＡ','発酵中'),true);assert.equal(c.recordMatches(c.batches[0],'ipa','完了'),false);c.run('recordSearch="IPA"');c.applyRecordFilters();assert.equal(c.cards[0].hidden,false);assert.equal(c.cards[1].hidden,true);assert.equal(c.$('recordFilterCount').textContent,'1件 / 全2件');c.run('recordSearch="missing"');c.applyRecordFilters();assert.equal(c.$('recordNoMatches').hidden,false);c.clearRecordFilters();assert.equal(c.cards[1].hidden,false);assert.equal(JSON.stringify(c.batches),before);});
test('search form preserves escaped input and release caches its script',()=>{const c=harness();c.run('recordSearch=\'" onfocus="bad\'');assert.match(c.recordFiltersHtml(),/&quot;/);const dir=path.join(__dirname,'..'),v=JSON.parse(fs.readFileSync(path.join(dir,'version.json'),'utf8')).version;for(const file of ['index.html','sw.js'])assert.ok(fs.readFileSync(path.join(dir,file),'utf8').includes(`display-controls.js?v=${v}`));});
