const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const cloud = fs.readFileSync(path.join(root, 'cloud-sync.js'), 'utf8');
function extract(name){
  const start = html.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start>=0, name);
  const rest = html.slice(start);
  return rest.slice(0, rest.search(/^}/m)+1);
}
function app(){
  const data = new Map();
  const alerts = [];
  const fields = new Map();
  const c = vm.createContext({console, alerts, data, Date,
    alert:x=>alerts.push(x), confirm:()=>true, confirmAction:async()=>true,
    uid:(()=>{let n=0; return ()=>`new-${++n}`;})(),
    todayDateValue:()=> '2026-09-03', round2:x=>Math.round(x*100)/100,
    $:id=>{if(!fields.has(id)) fields.set(id,{value:'', hidden:true}); return fields.get(id);},
    document:{querySelector:()=>null}, collectRows:()=>[],
    renderGauge(){}, renderList(){}, renderInventory(){}, renderFormInvDeductArea(){}, openDetail(){}, showView(){}, toggleDataMenu(){},
    window:{storage:{async set(k,v){data.set(k,v);}, async get(k){if(!data.has(k)) throw Error('missing'); return {value:data.get(k)};}, async delete(k){data.delete(k);}},fermentCloudSync:{queueSave(){}}},
    downloadBlob:(...args)=>{c.download=args;},
    persist:async()=>{}, persistInventory:async()=>{}, maybeAutoBackup:async()=>{},
    resetForm:()=>vm.runInContext('copiedScheduleSteps=[]',c),
    populateFormFields:x=>{c.populated=x;},
  });
  vm.runInContext('let batches=[], inventory=[], editingId=null, lastViewedBatchId=null, formIsOpen=false, copiedScheduleSteps=[];',c);
  vm.runInContext('window.fermentCloudData={getSnapshot(){return JSON.parse(JSON.stringify({schemaVersion:1,batches,inventory}));},async applySnapshot(p){batches=p.batches;inventory=p.inventory;}};',c);
  for(const name of ['invStock','deductInventoryForBatch','syncInventoryForBatch','copyScheduleForNewBatch','duplicateBatch','scaleDuplicateBatch','buildBatchFromForm','saveBatch','preservePackageShipments','prepareDeletion','finishDeletion','undoLastDeletion','deleteInventoryReceipt','deleteInventoryItem','deleteInventoryConsumption','deleteBatch','deleteShipmentLot','csvEscape','exportInventoryCSV']) vm.runInContext(extract(name),c);
  c.INV_CATEGORY_LABEL={hop:'ホップ'};
  vm.runInContext(extract('confirmDataAction'),c);
  vm.runInContext('let inventoryAdjustmentState=null,inventoryAdjustmentSaving=false;let inventorySort="usage",inventoryEditorState=null,inventoryEditSaving=false;',c);
  for(const name of ['inventoryItemLabel','inventoryUsage','sortInventoryItems','invItemsByCategory','escapeHtml','invSelectOptions','validateInventoryMetadata','inventoryIdentityExists','receiptEditableFields','buildInventoryReceipt','persistInventoryReplacement','submitInventoryEditor','receiptCorrectionsHtml','inventoryMetadataHistoryHtml'])vm.runInContext(extract(name),c);
  for(const name of ['getInventoryLedgerRows','filterInventoryLedgerRows','buildInventoryAdjustment','submitInventoryAdjustment']) vm.runInContext(extract(name),c);
  c.getPackages=b=>b.packages||[];
  c.set=(b,i)=>{c.seedB=b;c.seedI=i;vm.runInContext('batches=seedB;inventory=seedI',c);};
  c.read=()=>c.window.fermentCloudData.getSnapshot();
  c.run=s=>vm.runInContext(s,c);
  return c;
}
const item=(amount=100)=>({id:'h',name:'Hop',category:'hop',unit:'g',receipts:[{id:'r',amount,date:'2026-09-01'}],consumptions:[]});
const batch=(amounts=[60,60])=>({id:'b',batchName:'B',hops:amounts.map(amount=>({invId:'h',amount})),customScheduleSteps:[]});
test('all inline scripts and cloud script parse',()=>{
  for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(match[1]);
  new vm.Script(cloud);
});

test('release number agrees across visible labels, scripts, help and service worker',()=>{
  const release=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8'));
  const v=release.version;
  assert.ok(Number.isSafeInteger(v)&&v>0);
  assert.ok(html.includes(`const APP_VERSION = ${v};`));
  assert.match(html,new RegExp(`id="appVersion"[^>]*>v${v}</span>`));
  assert.ok(html.includes(`id="menuAppVersion">v${v}</strong>`));
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert.ok(sw.includes(`fermenters-ledger-v${v}`));
  assert.ok(sw.includes("pathname.endsWith('/version.json')"));
  for(const file of ['supabase-config.js','cloud-sync.js','inventory-costing.js','inventory-valuation-ui.js','batch-expenses.js','batch-expenses-ui.js','cost-catalog.js','cost-catalog-ui.js']){
    assert.ok(html.includes(`${file}?v=${v}`));assert.ok(sw.includes(`${file}?v=${v}`));
  }
  assert.ok(html.includes(`help.html?embedded=1&v=${v}`));
  assert.ok(fs.readFileSync(path.join(root,'help.html'),'utf8').includes(`<strong>v${v}</strong>`));
});

test('version check distinguishes latest, newer, rollout, offline and invalid responses',async()=>{
  const fields=new Map();const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  const c=vm.createContext({Number,Date,AbortController,setTimeout,clearTimeout,location:{protocol:'https:'},
    $:id=>{if(!fields.has(id))fields.set(id,{});return fields.get(id);}});
  vm.runInContext(`const APP_VERSION=${version};let versionCheckBusy=false;`,c);
  vm.runInContext(extract('versionStatusMessage'),c);vm.runInContext(extract('checkAppVersion'),c);
  for(const [remote,expected] of [[version,/確認時点の公開最新版/],[version+1,/新しい公開版/],[version-1,/配信切り替え中/],['bad',/確認できません/]]){
    c.fetch=async(url,options)=>{assert.equal(options.cache,'no-store');assert.ok(url.startsWith('./version.json?check='));return {ok:true,json:async()=>({version:remote})};};
    await c.checkAppVersion();assert.match(c.$('versionCheckStatus').textContent,expected);assert.equal(c.$('versionCheckButton').disabled,false);
  }
  c.fetch=async()=>{throw Error('offline');};await c.checkAppVersion();assert.match(c.$('versionCheckStatus').textContent,/確認できません/);
  c.fetch=async()=>({ok:false});await c.checkAppVersion();assert.match(c.$('versionCheckStatus').textContent,/確認できません/);
  c.location.protocol='file:';await c.checkAppVersion();assert.match(c.$('versionCheckStatus').textContent,/ローカルファイル/);
});
test('staged hops use total stock; insufficient consumption makes no writes',async()=>{
  const c=app(); c.set([batch()],[item()]);
  await c.deductInventoryForBatch('b','list');
  assert.equal(c.read().inventory[0].consumptions.length,0);
  assert.match(c.alerts[0],/120/);
});
test('exact stock, repeated click, update quantities and decimal tolerance',async()=>{
  const c=app();c.set([batch([60,40])],[item()]);
  await c.deductInventoryForBatch('b','list');
  assert.equal(c.invStock(c.read().inventory[0]),0);
  await c.deductInventoryForBatch('b','list');
  assert.equal(c.read().inventory[0].consumptions.length,2);
  c.run('batches[0].hops[0].amount=70');
  await c.syncInventoryForBatch('b','list');
  assert.equal(c.invStock(c.read().inventory[0]),0);
  c.set([batch([0.1,0.2])],[item(0.3)]);
  await c.deductInventoryForBatch('b','list');
  assert.equal(c.invStock(c.read().inventory[0]),0);
});
test('negative, non-finite, and missing inventory references rejected',async()=>{
  for(const amount of [-1,'NaN','Infinity']){
    const c=app();c.set([batch([amount])],[item()]);
    await c.deductInventoryForBatch('b','list');
    assert.equal(c.read().inventory[0].consumptions.length,0);
  }
  const c=app();c.set([batch() ],[]);
  await c.deductInventoryForBatch('b','list');
  assert.match(c.alerts[0],/連携先/);
});
test('copy and scale-copy preserve steps on new save, not actuals or source IDs',async()=>{
  for(const scaled of [false,true]){
    const c=app();const b=batch();b.batchSize='20';b.customScheduleSteps=[{id:'s',label:'別鍋',plannedTime:'10:00',actualTime:'10:05',duration:'20',notes:'2L'}];
    c.set([b],[]);c.prompt=()=> '40';
    if(scaled) c.scaleDuplicateBatch('b'); else c.duplicateBatch('b');
    c.$('f_batchName').value='copy';await c.saveBatch();
    const result=c.read().batches[1];
    assert.equal(result.customScheduleSteps[0].label,'別鍋');
    assert.equal(result.customScheduleSteps[0].actualTime,'');
    assert.notEqual(result.customScheduleSteps[0].id,'s');
    assert.equal(c.read().batches[0].customScheduleSteps[0].actualTime,'10:05');
    assert.equal(result.gravityLog.length,0);
    c.resetForm();assert.equal(c.buildBatchFromForm(null).customScheduleSteps.length,0);
  }
});
test('editing preserves additional costs and both copy modes start without costs or history',()=>{
  for(const scaled of [false,true]){
    const c=app(),b=batch();b.batchSize='20';b.otherCosts=[{id:'cost1',amount:1000,percent:20}];b.otherCostsReviewed=true;b.otherCostHistory=[{id:'audit1'}];c.set([b],[]);
    const edited=c.buildBatchFromForm('b');
    assert.equal(JSON.stringify(edited.otherCosts),JSON.stringify(b.otherCosts));assert.equal(edited.otherCostsReviewed,true);assert.equal(edited.otherCostHistory[0].id,'audit1');
    c.prompt=()=> '40';if(scaled)c.scaleDuplicateBatch('b');else c.duplicateBatch('b');
    assert.equal(c.populated.otherCosts.length,0);assert.equal(c.populated.otherCostHistory.length,0);assert.equal(c.populated.otherCostsReviewed,false);
    const fresh=c.buildBatchFromForm(null);assert.equal(fresh.otherCosts.length,0);assert.equal(fresh.otherCostHistory.length,0);assert.equal(fresh.otherCostsReviewed,false);
  }
});

test('receipt delete writes durable checkpoint; undo does not overwrite later edits',async()=>{
  const c=app();c.set([],[item()]);
  await c.deleteInventoryReceipt('h','r');
  assert.equal(c.read().inventory[0].receipts.length,0);
  await c.undoLastDeletion();
  assert.equal(c.read().inventory[0].receipts.length,1);
  await c.deleteInventoryReceipt('h','r');
  c.run('inventory[0].name="Changed"');
  await c.undoLastDeletion();
  assert.equal(c.read().inventory[0].name,'Changed');
  assert.equal(c.read().inventory[0].receipts.length,0);
  assert.ok(c.download);
});

test('editing retains process observations while new, copied and scaled batches start empty',()=>{
  for(const scaled of [false,true]){
    const c=app(),b=batch();b.batchSize='20';b.processMeasurements=[{id:'p',ph:5.2,history:[{reason:'測定'}]}];c.set([b],[]);
    assert.deepEqual(c.buildBatchFromForm('b').processMeasurements,b.processMeasurements);
    c.prompt=()=> '40';if(scaled)c.scaleDuplicateBatch('b');else c.duplicateBatch('b');assert.equal(c.populated.processMeasurements.length,0);assert.equal(c.buildBatchFromForm(null).processMeasurements.length,0);
  }
});
test('deleting linked item then undo restores links and consumption',async()=>{
  const c=app();c.set([batch([10])],[item()]);
  await c.deductInventoryForBatch('b','list');
  await c.deleteInventoryItem('h');
  assert.equal(c.read().inventory.length,0);
  await c.undoLastDeletion();
  assert.equal(c.read().batches[0].hops[0].invId,'h');
  assert.equal(c.invStock(c.read().inventory[0]),90);
});
test('checkpoint failure prevents deletion',async()=>{
  const c=app();c.set([],[item()]);c.window.storage.set=async()=>{throw Error('quota');};
  await c.deleteInventoryReceipt('h','r');
  assert.equal(c.read().inventory[0].receipts.length,1);
});

test('canceling each deletion leaves data and checkpoints unchanged',async()=>{
  for(const action of [c=>c.deleteInventoryItem('h'),c=>c.deleteInventoryReceipt('h','r'),c=>c.deleteInventoryConsumption('h','c'),c=>c.deleteBatch('b'),c=>c.deleteShipmentLot('b',0,'lot')]){
    const c=app();const i=item();i.consumptions=[{id:'c',amount:10,batchId:'b'}];
    const b=batch([10]);b.packages=[{shipments:[{id:'lot',quantity:2}]}];c.set([b],[i]);
    const before=JSON.stringify(c.read());c.confirmAction=async()=>false;
    await action(c);
    assert.equal(JSON.stringify(c.read()),before);
    assert.equal(c.data.has('wangan-last-deletion'),false);
  }
});

test('confirmation-time edits or cloud replacements abort deletion',async()=>{
  for(const replace of [false,true]){
    const c=app();c.set([],[item()]);let calls=0;
    c.confirmAction=async()=>{if(++calls===1)c.run(replace?'inventory=JSON.parse(JSON.stringify(inventory))':'inventory[0].name="Updated"');return true;};
    await c.deleteInventoryItem('h');
    assert.equal(c.read().inventory.length,1);
    assert.equal(c.data.has('wangan-last-deletion'),false);
  }
});

test('cancel or concurrent edits while confirming undo do not restore',async()=>{
  for(const cancel of [true,false]){
    const c=app();c.set([],[item()]);await c.deleteInventoryReceipt('h','r');
    c.confirmAction=async()=>{if(!cancel)c.run('inventory[0].name="Updated"');return !cancel;};
    await c.undoLastDeletion();
    assert.equal(c.read().inventory[0].receipts.length,0);
    assert.equal(c.data.has('wangan-last-deletion'),true);
  }
});
test('edits during deletion persistence cannot be rolled back by undo',async()=>{
  const c=app();c.set([],[item()]);
  c.persistInventory=async()=>{c.run('inventory[0].name="Concurrent edit"');};
  await c.deleteInventoryReceipt('h','r');await c.undoLastDeletion();
  assert.equal(c.read().inventory[0].name,'Concurrent edit');
  assert.equal(c.read().inventory[0].receipts.length,0);
});
test('consumption and shipment deletion undo restores full linked data',async()=>{
  const c=app();const b=batch([10]);b.packages=[{shipments:[{id:'lot',quantity:2}]}];c.set([b],[item()]);
  await c.deductInventoryForBatch('b','list');
  const consumption=c.read().inventory[0].consumptions[0].id;
  await c.deleteInventoryConsumption('h',consumption);
  assert.equal(c.invStock(c.read().inventory[0]),100);
  await c.undoLastDeletion();
  assert.equal(c.invStock(c.read().inventory[0]),90);
  assert.equal(c.read().batches[0].hops[0].invId,'h');
  await c.deleteShipmentLot('b',0,'lot');
  assert.equal(c.read().batches[0].packages[0].shipments.length,0);
  await c.undoLastDeletion();
  assert.equal(c.read().batches[0].packages[0].shipments.length,1);
});
test('batch deletion keeps ledger, undo restores batch',async()=>{
  const c=app();c.set([batch([10])],[item()]);await c.deductInventoryForBatch('b','list');
  await c.deleteBatch('b');assert.equal(c.read().batches.length,0);
  assert.equal(c.invStock(c.read().inventory[0]),90);
  await c.undoLastDeletion();assert.equal(c.read().batches.length,1);
});
test('same-name inventory CSV balances remain separate',()=>{
  const c=app();const other=item(20);other.id='h2';c.set([],[item(),other]);
  c.exportInventoryCSV();
  const rows=c.download[0].split('\r\n').slice(1).map(x=>x.split(','));
  assert.deepEqual(rows.map(x=>x[6]),['100','20']);
  assert.deepEqual(rows.map(x=>x[9]),['h','h2']);
});

test('stocktake adjustment is a delta: receipts and recipe consumptions stay unchanged',()=>{
  const c=app();const i=item(25);i.consumptions=[{id:'c',amount:3,date:'2026-09-02'}];
  const originals=JSON.stringify([i.receipts,i.consumptions]);
  const a=c.buildInventoryAdjustment(i,'20.125','実地棚卸','2026-09-03','2026-09-03T00:00:00Z');
  assert.equal(a.before,22);assert.equal(a.amount,-1.875);i.adjustments=[a];
  assert.equal(c.invStock(i),20.125);
  assert.equal(JSON.stringify([i.receipts,i.consumptions]),originals);
  i.adjustments.push(c.buildInventoryAdjustment(i,'0','廃棄確認','2026-09-03','now'));
  assert.equal(c.invStock(i),0);
  i.adjustments.push(c.buildInventoryAdjustment(i,'0.25','再計量','2026-09-03','now'));
  assert.equal(c.invStock(i),0.25);
});

test('stocktake rejects blank, negative, nonfinite, excessive precision, no reason, unchanged and future records',()=>{
  const c=app();const i=item();
  for(const value of ['', ' ', '-1','NaN','Infinity','1000000001','0.0001']) assert.throws(()=>c.buildInventoryAdjustment(i,value,'棚卸','2026-09-03','now'));
  assert.throws(()=>c.buildInventoryAdjustment(i,'1',' ','2026-09-03','now'));
  assert.throws(()=>c.buildInventoryAdjustment(i,'1','あ'.repeat(301),'2026-09-03','now'));
  assert.throws(()=>c.buildInventoryAdjustment(i,'100','棚卸','2026-09-03','now'));
  i.receipts[0].date='2026-09-04';assert.throws(()=>c.buildInventoryAdjustment(i,'1','棚卸','2026-09-03','now'));
});

test('ledger and CSV include adjustments and retain opening balance with date filters',()=>{
  const c=app();const i=item(25);i.consumptions=[{id:'c',amount:3,date:'2026-09-02'}];
  i.adjustments=[c.buildInventoryAdjustment(i,'20','こぼれ','2026-09-03','now')];
  const other=item(7);other.id='h2';c.set([],[i,other]);
  const all=c.getInventoryLedgerRows();
  const selected=c.filterInventoryLedgerRows(all,{from:'2026-09-03',to:'2026-09-03',search:'hOP',category:'hop'});
  assert.equal(selected.length,1);assert.equal(selected[0].balance,20);assert.equal(selected[0].reason,'こぼれ');
  assert.equal(all.filter(r=>r.itemId==='h2').at(-1).balance,7);
  c.exportInventoryCSV();const csv=c.download[0];
  assert.match(csv,/棚卸調整,-2,g,20/);assert.match(csv,/こぼれ,22,20,now/);
  assert.match(csv,/調整記録日時/);
});

test('inventory deduction honors stocktake adjustments',async()=>{
  const c=app();const i=item(100);i.adjustments=[c.buildInventoryAdjustment(i,'5','棚卸','2026-09-03','now')];
  c.set([batch([10])],[i]);await c.deductInventoryForBatch('b','list');
  assert.equal(c.read().inventory[0].consumptions.length,0);
  c.set([batch([5])],[i]);await c.deductInventoryForBatch('b','list');
  assert.equal(c.invStock(c.read().inventory[0]),0);
});

function prepareStocktake(c){
  c.set([],[item(25)]);
  c.run('inventoryAdjustmentState={itemId:"h",before:JSON.stringify(window.fermentCloudData.getSnapshot())}');
  c.$('inventoryAdjustmentActual').value='20';
  c.$('inventoryAdjustmentReason').value='棚卸';
  c.$('inventoryAdjustmentDialog').close=()=>{c.closed=true;};
}

test('stocktake persists once, roundtrips snapshot and backs up without modifying recipe',async()=>{
  const c=app();prepareStocktake(c);await c.submitInventoryAdjustment();
  const saved=JSON.parse(c.data.get('wangan-inventory'));
  assert.equal(c.invStock(saved[0]),20);assert.equal(saved[0].adjustments.length,1);
  assert.equal(c.closed,true);
  const snapshot=c.read();await c.window.fermentCloudData.applySnapshot(JSON.parse(JSON.stringify(snapshot)));
  assert.equal(c.invStock(c.read().inventory[0]),20);
});

test('stocktake cancellation, double submission, failed save and stale form are safe',async()=>{
  const c=app();prepareStocktake(c);const original=JSON.stringify(c.read());
  c.confirmAction=async()=>false;await c.submitInventoryAdjustment();assert.equal(JSON.stringify(c.read()),original);
  c.confirmAction=async()=>true;c.window.storage.set=async()=>{throw Error('quota');};
  await c.submitInventoryAdjustment();assert.equal(JSON.stringify(c.read()),original);assert.match(c.$('inventoryAdjustmentError').textContent,/保存できなかった/);
  c.run('inventory[0].name="changed"');await c.submitInventoryAdjustment();assert.match(c.$('inventoryAdjustmentError').textContent,/更新/);
  const d=app();prepareStocktake(d);let release;
  d.confirmAction=()=>new Promise(r=>release=r);
  const first=d.submitInventoryAdjustment();await d.submitInventoryAdjustment();release(true);await first;
  assert.equal(d.read().inventory[0].adjustments.length,1);
});

function cloudApp({remoteRevision=1, pending='0', localOrg='org', localRevision=1, hasLocal=true}={}){
  const store=new Map([['ferment-cloud-pending-v1',pending],['ferment-cloud-local-organization',localOrg],['ferment-cloud-revision:org',String(localRevision)]]);
  const els=new Map();const events={};const timers=[];const saves=[];let applyCount=0;
  let local={schemaVersion:1,batches:[{id:'local'}],inventory:[]};
  const remote={revision:remoteRevision,payload:{schemaVersion:1,batches:[{id:'remote'}],inventory:[]}};
  const client={rpc:async(name,args)=>{
    if(name==='create_personal_organization') return {data:'org'};
    saves.push(args);if(c.onSave) await c.onSave();return {data:++remote.revision};
  },from:()=>({select:()=>({eq:()=>({single:async()=>({data:remote})})})}),auth:{getSession:async()=>({data:{session:{user:{id:'u'}}}}),onAuthStateChange(){}}};
  const c=vm.createContext({console,URLSearchParams,location:{search:''},crypto:{randomUUID:()=> 'device'},navigator:{onLine:true},localStorage:{getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,v)},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout:n=>{if(n)timers[n-1]=null;},confirm:()=>false,
    document:{getElementById:id=>{if(!els.has(id))els.set(id,{});return els.get(id);}},window:{FERMENTERS_LEDGER_CLOUD:{enabled:true,supabaseUrl:'test',supabasePublishableKey:'test'},supabase:{createClient:()=>client},fermentCloudData:{hasLocalData:()=>hasLocal,getSnapshot:()=>local,applySnapshot:async p=>{local=p;applyCount++;}},addEventListener:(n,f)=>events[n]=f,storage:{set:async()=>{}}}});
  vm.runInContext(cloud,c);
  return {c,store,saves,remote,els,events,applyCount:()=>applyCount,async drain(){for(let i=0;i<20 && timers.some(Boolean);i++){const f=timers.shift();if(f)await f();}},edit(){local={...local,changed:true};c.window.fermentCloudSync.queueSave();}};
}
test('unsent offline changes are not overwritten by a newer cloud revision',async()=>{
  const h=cloudApp({remoteRevision:2,pending:'1'});await h.events.load();
  assert.equal(h.applyCount(),0);assert.equal(h.saves.length,0);
  assert.equal(h.els.get('cloudSyncBadge').textContent,'選択が必要');
});
test('unsent deletion of all local records is treated as an edit',async()=>{
  const h=cloudApp({remoteRevision:2,pending:'1',hasLocal:false});await h.events.load();
  assert.equal(h.applyCount(),0);assert.equal(h.els.get('cloudSyncBadge').textContent,'選択が必要');
});
test('edits during cloud request are sent in a follow-up save',async()=>{
  const h=cloudApp();await h.events.load();
  h.c.onSave=async()=>{h.c.onSave=null;h.edit();};
  h.edit();await h.drain();
  assert.equal(h.saves.length,2);assert.equal(h.store.get('ferment-cloud-pending-v1'),'0');
});
test('same revision with pending changes uploads on login',async()=>{
  const h=cloudApp({pending:'1'});await h.events.load();assert.equal(h.saves.length,1);
});

test('monthly archives missing from older cloud payloads are retained and re-uploaded',async()=>{
  const engine=require('../inventory-costing.js');
  const h=cloudApp({remoteRevision:2});
  const report=engine.makeReport([{id:'i',name:'test',receipts:[],consumptions:[]}],'2026-08','2026-09-03','r','now','test');
  h.c.window.fermentCloudData.getSnapshot().valuationBook={reports:[report],autoEnabled:false,startMonth:''};
  h.c.window.fermentCloudData.prepareRemoteSnapshot=payload=>{
    const merged=engine.mergeArchive(h.c.window.fermentCloudData.getSnapshot().valuationBook,payload.valuationBook);
    return {payload:{...payload,valuationBook:merged.book},needsSave:merged.needsSave};
  };
  await h.events.load();await h.drain();
  assert.equal(h.applyCount(),1);assert.equal(h.saves.length,1);
  assert.equal(h.saves[0].snapshot_payload.valuationBook.reports[0].id,'r');
});
test('different workspace data is neither uploaded nor replaced',async()=>{
  const h=cloudApp({localOrg:'other',pending:'1'});await h.events.load();h.edit();await h.drain();
  assert.equal(h.saves.length,0);assert.equal(h.applyCount(),0);
});
test('SQL guards writes by role and archives before changing snapshot',()=>{
  const sql=fs.readFileSync(path.join(root,'supabase-schema.sql'),'utf8');
  assert.match(sql,/member_role not in \('owner', 'admin', 'brewer'\)/);
  assert.match(sql,/revoke all on function public.save_app_snapshot\(uuid, jsonb, bigint, text\) from public, anon/);
  assert.match(sql,/revoke all on table public.app_snapshot_history from anon, authenticated/);
  assert.ok(sql.indexOf('insert into public.app_snapshot_history')<sql.indexOf('update public.app_snapshots'));
});
