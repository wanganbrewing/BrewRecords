const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const dir=path.join(__dirname,'..'),source=fs.readFileSync(path.join(dir,'ui-polish.js'),'utf8');
function harness(){const els={editorStatus:{},screenHeading:{},editorToolbar:{}},buttons=[{},{}];const c=vm.createContext({document:{addEventListener(){},getElementById:id=>els[id],querySelectorAll:()=>buttons},formIsOpen:true,saveBatch:async()=>{},cancelForm(){},confirm:()=>false});vm.runInContext(source,c);return {c,els,buttons};}
test('screen headings describe the task and toolbar is scoped to brewing',()=>{const {c,els}=harness();c.updateScreenChrome('form');assert.equal(els.screenHeading.textContent,'仕込みの内容を入力する');assert.equal(els.editorToolbar.hidden,false);c.updateScreenChrome('inventory');assert.equal(els.screenHeading.textContent,'在庫と入荷・使用を管理する');assert.equal(els.editorToolbar.hidden,true);});
test('save errors and validation keep status honest and unlock controls',async()=>{const {c,els,buttons}=harness();await c.saveFromEditor();assert.match(els.editorStatus.textContent,/まだ保存されていません/);c.saveBatch=async()=>{throw Error('offline');};await c.saveFromEditor();assert.match(els.editorStatus.textContent,/保存できません/);assert.ok(buttons.every(b=>b.disabled===false));});
test('save prevents double submission and reports local versus cloud distinctly',async()=>{const {c,els}=harness();let count=0,finish;c.saveBatch=()=>{count++;return new Promise(r=>finish=r);};const first=c.saveFromEditor();await c.saveFromEditor();assert.equal(count,1);c.formIsOpen=false;finish();await first;assert.match(els.editorStatus.textContent,/端末への保存/);assert.match(els.editorStatus.textContent,/クラウド同期/);});
test('cancel leaves dirty form intact when discard is declined',()=>{const {c}=harness();let calls=0;c.cancelForm=()=>calls++;vm.runInContext('uiFormDirty=true',c);c.cancelFromEditor();assert.equal(calls,0);c.confirm=()=>true;c.cancelFromEditor();assert.equal(calls,1);});
test('UI assets are versioned and cached',()=>{const v=JSON.parse(fs.readFileSync(path.join(dir,'version.json'),'utf8')).version;for(const file of ['index.html','sw.js'])for(const asset of ['ui-polish.css','ui-polish.js'])assert.ok(fs.readFileSync(path.join(dir,file),'utf8').includes(`${asset}?v=${v}`));});

function welcomeHarness(){
  const {c,els}=harness(),stored=new Map();
  Object.assign(els,{welcomePanel:{hidden:true},inventoryEmptyGuide:{hidden:true},inventorySortControl:{hidden:false}});
  Object.assign(c,{batches:[],inventory:[],inventoryMode:'cards',localStorage:{getItem:k=>stored.get(k),setItem:(k,v)=>stored.set(k,v)}});
  c.document.querySelector=()=>null;
  return {c,els,stored,ready:()=>vm.runInContext('uiDataLoaded=true',c)};
}
test('welcome waits for data and only appears for empty batches AND inventory',()=>{
  const {c,els,ready}=welcomeHarness();c.updateWelcomeState();assert.equal(els.welcomePanel.hidden,true);
  ready();c.updateWelcomeState();assert.equal(els.welcomePanel.hidden,false);assert.equal(els.inventorySortControl.hidden,true);
  c.batches=[{id:'b'}];c.updateWelcomeState();assert.equal(els.welcomePanel.hidden,true);
  c.batches=[];c.inventory=[{id:'i'}];c.updateWelcomeState();assert.equal(els.welcomePanel.hidden,true);assert.equal(els.inventorySortControl.hidden,false);
  c.inventoryMode='ledger';c.updateWelcomeState();assert.equal(els.inventorySortControl.hidden,true);
});
test('dismissal changes only browser preference and survives blocked storage',()=>{
  const {c,els,stored,ready}=welcomeHarness();ready();const before=JSON.stringify([c.batches,c.inventory]);c.dismissWelcome();assert.equal(els.welcomePanel.hidden,true);assert.equal(stored.get('ferment-welcome-dismissed-v1'),'1');assert.equal(JSON.stringify([c.batches,c.inventory]),before);
  c.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};assert.doesNotThrow(()=>c.dismissWelcome());assert.equal(els.welcomePanel.hidden,true);
});
test('demo welcome preference is separate and starting a batch preserves open drafts',()=>{
  const {c,stored}=welcomeHarness();c.DEMO_MODE=true;c.dismissWelcome();assert.equal(stored.has('ferment-welcome-dismissed-v1'),false);
  let newCalls=0,viewCalls=0;c.openNewForm=()=>newCalls++;c.showView=()=>viewCalls++;
  c.startWelcomeBatch();assert.equal(newCalls,0);assert.equal(viewCalls,1);
  c.formIsOpen=false;c.startWelcomeBatch();assert.equal(newCalls,1);
});
test('CSV dialog preserves eight existing actions outside the hamburger menu',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8');
  const menu=html.match(/<aside[^>]+id="dataMenu"[\s\S]*?<\/aside>/)[0];
  const dialog=html.match(/<dialog id="exportDialog"[\s\S]*?<\/dialog>/)[0];
  const names=['exportCSV','exportInventoryCSV','exportValuationCSV','exportBatchCostsCSV','exportBatchCostDetailsCSV','exportProcessMeasurementsCSV','exportShipmentsCSV','exportShipmentsMonthlySummaryCSV'];
  for(const name of names){assert.ok(!menu.includes(`onclick="${name}()`));assert.equal(dialog.split(`onclick="${name}()"`).length-1,1);}
  assert.match(menu,/openExportDialog/);assert.match(dialog,/aria-labelledby="exportDialogTitle"/);assert.match(dialog,/絞り込みはCSVには適用されません/);
});
test('input hints leave values and placeholders alone and do not repeat annotations',()=>{
  const {c}=harness(),attrs={};const input={value:'',placeholder:'1.050',getAttribute:()=>'.001',setAttribute:(k,v)=>attrs[k]=v};
  c.prepareInputHints({querySelectorAll:()=>[input]});assert.equal(input.value,'');assert.equal(input.placeholder,'1.050');assert.equal(attrs.inputmode,'decimal');assert.ok(!source.includes('createElement(\'small\')'));
});
test('home screen name matches app, version remains visible and safety notes remain inline',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.webmanifest'),'utf8'));
  assert.equal(manifest.name,manifest.short_name);assert.ok(html.includes(`name="apple-mobile-web-app-title" content="${manifest.name}"`));
  assert.match(html,/<span class="app-version" id="appVersion"/);assert.match(html,/id="menuReleaseNote"/);
  assert.match(html,/予定（時刻）/);assert.match(html,/実測（比重・pH・温度・液量）/);
  assert.match(html,/仕込みを保存するだけでは減りません/);assert.match(html,/会計・申告用の確定額ではありません/);
  assert.ok(!/<details[^>]*\sopen(?:[\s>])/.test(html));
});
