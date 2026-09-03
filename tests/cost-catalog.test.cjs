const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const C=require('../cost-catalog.js'),E=require('../batch-expenses.js');
const item=(over={})=>({id:'s',name:'殺菌剤A',category:'sanitizer',unit:'L',rate:2000,note:'税込の参考',...over});
const book=()=>C.revise(null,item(),'初回','now','h');
test('catalog validates prices, precision and units, blank is not free',()=>{
  assert.equal(C.normalizeItem(item({rate:0})).rate,0);assert.equal(C.normalizeItem(item({rate:0.0123,unit:'mL'})).rate,0.0123);
  for(const rate of ['',null,-1,'Infinity',0.00001,1e10])assert.throws(()=>C.normalizeItem(item({rate})));
  assert.throws(()=>C.normalizeItem(item({unit:'unknown'})));assert.throws(()=>C.normalizeItem(item({category:'unknown'})));
});
test('catalog revisions retain history; archive is reversible, duplicate identity rejected',()=>{
  const a=book(),b=C.revise(a,item({rate:3000}),'値上げ','later','h2');assert.equal(a.items[0].rate,2000);assert.equal(b.history[1].before.rate,2000);assert.equal(b.items[0].revision,2);
  assert.throws(()=>C.revise(a,item({id:'other'}),'重複','later','h3'));
  const hidden=C.revise(a,item({archived:true}),'廃止','later','h4');assert.throws(()=>C.expense(hidden.items[0],'e'));
  assert.equal(C.revise(hidden,item(),'再開','later','h5').items[0].archived,false);
});
test('reference usage calculates from frozen price, ignores forged amount or allocation, preserves zero vs blank',()=>{
  const row=C.expense(book().items[0],'e');row.pricing.quantity=0.1;row.amount=999;row.percent=10;
  const clean=E.normalizeRow(row,'2026-09-03');assert.equal(clean.amount,200);assert.equal(clean.percent,100);assert.equal(E.summarize([clean],'2026-09-03').subtotal,200);
  const changed=C.revise(book(),item({rate:5000}),'変更','later','h2');assert.equal(changed.items[0].rate,5000);assert.equal(E.summarize([clean],'2026-09-03').subtotal,200);
  row.pricing.quantity='';assert.equal(E.summarize([row],'2026-09-03').unknown,1);row.pricing.quantity=0;assert.equal(E.summarize([row],'2026-09-03').unknown,0);
  row.pricing.quantity=-1;assert.throws(()=>E.normalizeRow(row,'2026-09-03'));
});
test('per-batch reference defaults to one; repeated reference item cannot double count',()=>{
  const row=C.expense(item({unit:'回（1仕込み）',rate:300}),'e');assert.equal(row.pricing.quantity,1);
  assert.equal(E.summarize([row],'2026-09-03').subtotal,300);
  assert.throws(()=>E.revision({otherCosts:[]},[row,{...row,id:'e2'}],true,'追加','2026-09-03','h','now'),/重複/);
  const saved=E.revision({},[row],true,'追加','2026-09-03','h','now');assert.equal(saved.otherCostHistory[0].after.rows[0].pricing.rate,300);
});
test('backup merge preserves existing prices with same IDs and adds missing items',()=>{
  const a=book(),b=C.revise(a,item({rate:4000}),'価格更新','later','h2');b.items.push(C.normalizeItem(item({id:'s2',name:'別品目'})));
  const merged=C.merge(a,b);assert.equal(merged.items.length,2);assert.equal(merged.items[0].rate,2000);assert.equal(merged.history.length,2);assert.deepEqual(C.normalize(JSON.parse(JSON.stringify(merged))),merged);
});
function harness(){
  const fields=new Map(),writes=[];const c=vm.createContext({CostCatalog:C,BatchExpenses:E,console,Date,uid:()=> 'uid',todayDateValue:()=> '2026-09-03',escapeHtml:s=>String(s??'').replaceAll('<','&lt;'),maybeAutoBackup(){},confirmDataAction:async()=>true,
    $:id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,close(){}});return fields.get(id);},document:{addEventListener(){}},window:{storage:{async set(k,v){writes.push([k,v]);}},fermentCloudSync:{queueSave(){}}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../cost-catalog-ui.js'),'utf8'),c);
  c.run=s=>vm.runInContext(s,c);c.run('window.fermentCloudData={getSnapshot(){return {batches:[],inventory:[],costCatalog:catalogSnapshot()};}}');c.read=()=>c.window.fermentCloudData.getSnapshot();c.writes=writes;
  c.run('catalogEditorState={id:"s",before:JSON.stringify(window.fermentCloudData.getSnapshot())};');
  c.$('catalogName').value='殺菌剤A';c.$('catalogCategory').value='sanitizer';c.$('catalogUnit').value='L';c.$('catalogRate').value='2000';c.$('catalogReason').value='初回';return c;
}
test('catalog save, cancellation, stale confirmation, storage failure and double submit',async()=>{
  for(const mode of ['save','cancel','stale','failure']){
    const c=harness();if(mode==='cancel')c.confirmDataAction=async()=>false;if(mode==='stale')c.confirmDataAction=async()=>{c.run('costCatalog.history.push({id:"other"})');return true;};if(mode==='failure')c.window.storage.set=async()=>{throw Error('quota');};
    await c.saveCatalogEditor();assert.equal(c.read().costCatalog.items.length,mode==='save'?1:0);assert.equal(c.writes.length,mode==='save'?1:0);
  }
  const c=harness();let resolve;c.confirmDataAction=()=>new Promise(r=>resolve=r);const p=c.saveCatalogEditor();await c.saveCatalogEditor();resolve(true);await p;assert.equal(c.writes.length,1);
});
test('real cloud adapter retains catalog omitted by old clients and validates incoming catalogs',async()=>{
  const c=harness();await c.saveCatalogEditor();c.InventoryCosting=require('../inventory-costing.js');c.renderGauge=()=>{};c.renderList=()=>{};c.renderInventory=()=>{};c.refreshValuationControls=()=>{};c.renderValuation=()=>{};
  c.run('let batches=[],inventory=[],valuationBook={reports:[],autoEnabled:false,startMonth:""},valuationReadError="",valuationShown=null;');
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8'),start=html.indexOf('window.fermentCloudData = {'),end=html.indexOf('\n};',start)+3;vm.runInContext(html.slice(start,end),c);
  const prepared=c.window.fermentCloudData.prepareRemoteSnapshot({batches:[],inventory:[]});assert.equal(prepared.needsSave,true);assert.equal(prepared.payload.costCatalog.items[0].rate,2000);
  await c.window.fermentCloudData.applySnapshot(prepared.payload);assert.equal(c.read().costCatalog.items[0].rate,2000);
  await assert.rejects(c.window.fermentCloudData.applySnapshot({batches:[],inventory:[],costCatalog:{items:'bad'}}));assert.equal(c.read().costCatalog.items.length,1);
  const begin=html.indexOf('function buildBackupFileData(){'),rest=html.slice(begin);c.exportableBatches=()=>[];vm.runInContext(rest.slice(0,rest.search(/^}/m)+1),c);assert.equal(JSON.parse(c.buildBackupFileData().text).costCatalog.items[0].rate,2000);
});
