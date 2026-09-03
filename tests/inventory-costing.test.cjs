const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const engine=require('../inventory-costing.js');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');const ui=fs.readFileSync(path.join(__dirname,'../inventory-valuation-ui.js'),'utf8');
const receipt=(id,date,amount,price)=>({id,date,amount,price});
const item=()=>({id:'i',name:'Malt',category:'fermentable',unit:'kg',receipts:[receipt('r1','2026-08-01',10,1000),receipt('r2','2026-08-20',10,2000)],consumptions:[{id:'c1',date:'2026-08-10',amount:5,batchId:'b'},{id:'c2',date:'2026-08-25',amount:3,batchId:'b2'}],adjustments:[]});
test('moving average excludes future purchases and prices consumption at its date',()=>{
  const a=item(),before=JSON.stringify(a),r=engine.calculate([a],'2026-08-31');
  assert.equal(r.uses[0].value,500);assert.equal(r.uses[1].value,500);assert.equal(r.rows[0].quantity,12);assert.equal(r.rows[0].value,2000);assert.equal(r.subtotal,2000);
  const mid=engine.calculate([a],'2026-08-15');assert.equal(mid.rows[0].value,500);assert.equal(mid.rows[0].quantity,5);assert.equal(JSON.stringify(a),before);
});
test('missing price is not zero, while explicit zero is a valid free receipt',()=>{
  for(const price of ['',null,undefined,' ',NaN,-1,Infinity]){const a=item();a.receipts[0].price=price;const r=engine.calculate([a],'2026-08-31');assert.equal(r.rows[0].value,null);assert.equal(r.unknown,1);assert.equal(r.uses[0].value,null);}
  const a=item();a.receipts=[receipt('r','2026-08-01',10,0)];a.consumptions=[];assert.equal(engine.calculate([a],'2026-08-31').rows[0].value,0);
});
test('stocktake changes quantity and value at current average without editing receipts',()=>{
  const a=item();a.adjustments=[{date:'2026-08-31',amount:-2}];const r=engine.calculate([a],'2026-08-31');assert.equal(r.rows[0].quantity,10);assert.equal(r.rows[0].value,1666.67);assert.equal(a.receipts.length,2);
  const b={...item(),receipts:[],consumptions:[],adjustments:[{date:'2026-08-31',amount:2}]};assert.equal(engine.calculate([b],'2026-08-31').rows[0].value,null);
});
test('negative stock, invalid date or invalid amount never produces a complete value',()=>{
  for(const amend of [a=>a.consumptions[0].amount=50,a=>a.receipts[0].date='',a=>a.receipts[0].date='2026-02-30',a=>a.receipts[0].amount=-1]){const a=item();amend(a);assert.equal(engine.calculate([a],'2026-08-31').rows[0].value,null);}
});
test('depleted unknown stock can restart costing with a new priced receipt',()=>{
  const a=item();a.receipts[0].price='';a.consumptions[0].amount=10;const r=engine.calculate([a],'2026-08-31');assert.equal(r.uses[0].value,null);assert.equal(r.uses[1].value,600);assert.equal(r.rows[0].value,1400);
});
test('same-day order agrees with ledger: receipts, consumption, adjustment',()=>{
  const a=item();a.receipts=[receipt('r','2026-08-01',10,1000)];a.consumptions=[{date:'2026-08-01',amount:2,batchId:'b'}];a.adjustments=[{date:'2026-08-01',amount:-1}];assert.equal(engine.calculate([a],'2026-08-31').rows[0].value,700);
});
test('separate lots, zero stock and no data remain distinct',()=>{
  const a=item(),b={...item(),id:'i2',lotCode:'B',receipts:[],consumptions:[]};const r=engine.calculate([a,b],'2026-08-31');assert.equal(r.rows.length,2);assert.equal(r.rows[1].value,0);assert.equal(engine.calculate([],'2026-08-31').rows.length,0);
});
test('batch totals require matched consumed quantities and no unlinked ingredients',()=>{
  const calc=engine.calculate([item()],'2026-08-31'),batch={id:'b',fermentables:[{invId:'i',amount:5}]};assert.equal(engine.batchCost(batch,calc).subtotal,500);assert.equal(engine.batchCost(batch,calc).complete,true);
  for(const b of [{...batch,fermentables:[{invId:'i',amount:6}]},{...batch,fermentables:[{name:'unlinked',amount:5}]},{...batch,id:'unconsumed'}])assert.equal(engine.batchCost(b,calc).complete,false);
  assert.equal(engine.batchCost(batch,calc,['未連携']).complete,false);
  assert.equal(engine.batchCost({id:'b',fermentables:[]},calc).complete,false);
});
test('month boundaries, leap days, current/future month restrictions',()=>{
  assert.equal(engine.monthEnd('2024-02'),'2024-02-29');assert.equal(engine.previousMonth('2026-01-01'),'2025-12');
  for(const month of ['2026-13','2026-00','bad'])assert.throws(()=>engine.monthEnd(month));
  for(const month of ['2026-09','2026-10'])assert.throws(()=>engine.makeReport([item()],month,'2026-09-03','id','now','reason'));
  assert.throws(()=>engine.makeReport([],'2026-08','2026-09-03','id','now','reason'));
});
test('saved reports are independent of later receipt corrections and JSON roundtrip',()=>{
  const a=item(),r=engine.makeReport([a],'2026-08','2026-09-03','id','now','confirmed');a.receipts[0].price=5000;
  assert.equal(r.subtotal,2000);assert.notEqual(engine.calculate([a],'2026-08-31').subtotal,r.subtotal);
  assert.equal(engine.normalizeBook({reports:[r]}).reports[0].subtotal,2000);assert.throws(()=>engine.normalizeBook({reports:[null]}));
});
test('immutable monthly archive survives older cloud clients and merges without duplication',()=>{
  const r=engine.makeReport([item()],'2026-08','2026-09-03','id','now','reason'),local={reports:[r],autoEnabled:true,startMonth:'2026-09'};
  assert.equal(engine.mergeArchive(local,undefined).book.reports.length,1);assert.equal(engine.mergeArchive(local,undefined).needsSave,true);
  assert.equal(engine.mergeArchive(local,{reports:[r]}).needsSave,false);
  assert.equal(engine.mergeArchive(local,{reports:[]}).book.reports.length,1);
});
function harness(){
  const fields=new Map(),writes=[];let seq=0;
  const c=vm.createContext({console,Date,InventoryCosting:engine,uid:()=>`report-${++seq}`,todayDateValue:()=> '2026-09-03',escapeHtml:s=>String(s??''),inventoryMetaHtml:()=>'',maybeAutoBackup(){},confirmDataAction:async()=>true,
    $:id=>{if(!fields.has(id))fields.set(id,{value:'',open:false});return fields.get(id);},window:{storage:{async set(k,v){writes.push([k,v]);}},fermentCloudSync:{queueSave(){}}}});
  c.seed=[item()];vm.runInContext('let inventory=seed,batches=[],valuationBook={reports:[],autoEnabled:false,startMonth:""},valuationBusy=false,valuationShown=null,valuationReadError="";',c);
  vm.runInContext('window.fermentCloudData={getSnapshot(){return JSON.parse(JSON.stringify({batches,inventory,valuationBook}));}};',c);vm.runInContext(ui,c);
  c.run=s=>vm.runInContext(s,c);c.read=()=>c.window.fermentCloudData.getSnapshot();c.writes=writes;
  c.$('valuationMonth').value='2026-08';c.$('valuationReason').value='UAT';c.renderValuation();return c;
}
test('manual report save, canceled confirmation, duplicate save, stale preview and failed storage',async()=>{
  for(const scenario of ['ok','cancel','duplicate','stale','failure']){
    const c=harness();if(scenario==='cancel')c.confirmDataAction=async()=>false;
    if(scenario==='stale')c.run('inventory[0].receipts[0].price=9999');
    if(scenario==='failure')c.window.storage.set=async()=>{throw Error('quota');};
    await c.saveValuationReport();
    assert.equal(c.read().valuationBook.reports.length,scenario==='ok'||scenario==='duplicate'?1:0);
    if(scenario==='duplicate'){c.renderValuation();await c.saveValuationReport();assert.equal(c.read().valuationBook.reports.length,1);}
    assert.equal(c.run('valuationBusy'),false);
  }
});
test('auto capture is opt-in, covers missed months once, and preserves saved revisions',async()=>{
  const c=harness();await c.autoSaveValuations();assert.equal(c.writes.length,0);
  c.run('valuationBook.autoEnabled=true;valuationBook.startMonth="2026-07"');await c.autoSaveValuations();assert.equal(c.read().valuationBook.reports.length,2);
  c.run('inventory[0].receipts[0].price=9999');await c.autoSaveValuations();assert.equal(c.writes.length,1);assert.equal(c.read().valuationBook.reports[1].subtotal,2000);
});
test('concurrent confirmation edits block persistence; double click saves only once',async()=>{
  const c=harness();let release;c.confirmDataAction=()=>new Promise(r=>release=r);const first=c.saveValuationReport();await c.saveValuationReport();release(true);await first;assert.equal(c.writes.length,1);
  const d=harness();d.confirmDataAction=async()=>{d.run('inventory[0].name="changed"');return true;};await d.saveValuationReport();assert.equal(d.writes.length,0);
});
test('new scripts parse and snapshot/backup wiring includes valuation data',()=>{
  new vm.Script(ui);new vm.Script(fs.readFileSync(path.join(__dirname,'../inventory-costing.js'),'utf8'));
  assert.match(html,/valuationBook: JSON\.parse\(JSON\.stringify\(valuationBook\)\)/);
  assert.match(html,/const payload = \{ batches: targetBatches, inventory: inventory, valuationBook \}/);
  assert.match(html,/JSON\.stringify\(window\.fermentCloudData\.getSnapshot\(\)\)/);
});

test('real snapshot adapter and backup export roundtrip the new report archive',async()=>{
  const c=harness();await c.saveValuationReport();
  c.renderGauge=()=>{};c.renderList=()=>{};c.renderInventory=()=>{};
  c.exportableBatches=()=>c.read().batches;
  const start=html.indexOf('window.fermentCloudData = {'),end=html.indexOf('\n};',start)+3;
  vm.runInContext(html.slice(start,end),c);
  const saved=c.read();assert.equal(saved.valuationBook.reports.length,1);
  c.run('valuationBook={reports:[],autoEnabled:false,startMonth:""}');await c.window.fermentCloudData.applySnapshot(saved);
  assert.equal(c.read().valuationBook.reports[0].subtotal,2000);
  const begin=html.indexOf('function buildBackupFileData(){'),rest=html.slice(begin);vm.runInContext(rest.slice(0,rest.search(/^}/m)+1),c);
  assert.equal(JSON.parse(c.buildBackupFileData().text).valuationBook.reports[0].subtotal,2000);
  await c.window.fermentCloudData.applySnapshot({batches:[],inventory:[]});assert.equal(c.read().valuationBook.reports.length,0);
});
