const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const engine=require('../batch-expenses.js');const costing=require('../inventory-costing.js');
const ui=fs.readFileSync(path.join(__dirname,'../batch-expenses-ui.js'),'utf8');
const row=()=>({id:'e',category:'electricity',name:'8月電気代',date:'2026-08-31',amount:10000,percent:20,reference:'INV-01',note:'5仕込みの1回分'});
const batch=()=>({id:'b',batchName:'Test',batchSize:20,hops:[{invId:'h',amount:2}],otherCosts:[row()],otherCostsReviewed:true,customScheduleSteps:[{id:'s'}]});
test('allocation uses entered share with cent rounding, zero distinct from blank',()=>{
  assert.equal(engine.summarize([row()],'2026-09-03').subtotal,2000);
  for(const [amount,percent,value] of [[0,100,0],[100,0,0],[100,100,100],[100.01,33.33,33.33],['',100,null]])assert.equal(engine.summarize([{...row(),amount,percent}],'2026-09-03').rows[0].value,value);
});
test('validation rejects impossible input without mutating original',()=>{
  for(const change of [{amount:-1},{amount:Infinity},{amount:'NaN'},{amount:0.001},{amount:1e10},{percent:101},{percent:-1},{percent:''},{percent:0.001},{date:'2026-02-30'},{date:'2026-09-04'},{category:'bad'},{name:''},{name:'x'.repeat(121)},{note:'x'.repeat(301)}])assert.throws(()=>engine.normalizeRow({...row(),...change},'2026-09-03'));
  const a=row(),original=JSON.stringify(a);engine.normalizeRow(a,'2026-09-03');assert.equal(JSON.stringify(a),original);
});
test('unknown and malformed saved rows are not silently counted as known zero',()=>{
  assert.equal(engine.summarize([null],'2026-09-03').unknown,1);assert.equal(engine.summarize({},'2026-09-03').unknown,1);
  assert.equal(engine.summarize([{...row(),amount:''}],'2026-09-03').unknown,1);assert.equal(engine.summarize([], '2026-09-03').subtotal,0);
});
test('combined cost remains incomplete unless materials and extra-cost review are complete',()=>{
  const b=batch(),material={subtotal:1000,complete:true},sum=engine.combined(b,material,'2026-09-03');assert.equal(sum.total,3000);assert.equal(sum.perLiter,150);assert.equal(sum.complete,true);
  for(const changed of [{...b,otherCostsReviewed:false},{...b,otherCosts:[{...row(),amount:''}]}])assert.equal(engine.combined(changed,material,'2026-09-03').complete,false);
  assert.equal(engine.combined(b,{...material,complete:false},'2026-09-03').perLiter,null);
  assert.equal(engine.combined({...b,batchSize:''},material,'2026-09-03').perLiter,null);
  assert.equal(engine.combined({...b,otherCosts:[]},material,'2026-09-03').total,1000);
});
test('revision appends immutable before/after history and preserves all batch links',()=>{
  const b=batch(),before=JSON.stringify(b),next=engine.revision(b,[{...row(),amount:12000}],true,'請求書を訂正','2026-09-03','hist','now');
  assert.equal(next.otherCostHistory[0].before.rows[0].amount,10000);assert.equal(next.otherCostHistory[0].after.rows[0].amount,12000);
  assert.deepEqual(next.hops,b.hops);assert.deepEqual(next.customScheduleSteps,b.customScheduleSteps);assert.equal(JSON.stringify(b),before);
  const removed=engine.revision(next,[],true,'不要な費用を削除','2026-09-03','hist2','later');assert.equal(removed.otherCostHistory.length,2);assert.equal(removed.otherCostHistory[1].before.rows.length,1);assert.equal(removed.otherCosts.length,0);
});
test('revision guards reason, duplicated IDs, no changes and false completion',()=>{
  const b=batch();assert.throws(()=>engine.revision(b,[row()],true,'変更なし','2026-09-03','h','now'));
  assert.throws(()=>engine.revision(b,[],false,'','2026-09-03','h','now'));
  assert.throws(()=>engine.revision(b,[row(),row()],false,'重複','2026-09-03','h','now'));
  assert.throws(()=>engine.revision(b,[{...row(),amount:''}],true,'未入力','2026-09-03','h','now'));
  assert.equal(engine.revision(b,[{...row(),amount:''}],false,'後日確認','2026-09-03','h','now').otherCostsReviewed,false);
});
function harness(){
  const fields=new Map(),writes=[];let seq=0,draft=[row()];
  const c=vm.createContext({console,Date,BatchExpenses:engine,InventoryCosting:costing,uid:()=>`new-${++seq}`,todayDateValue:()=> '2026-09-03',yenReference:x=>x==null?'未計算':`¥${x}`,escapeHtml:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),csvEscape:v=>String(v??''),getUnlinkedMaterials:()=>[],maybeAutoBackup(){},openDetail(){},confirmDataAction:async()=>true,
    $:id=>{if(!fields.has(id))fields.set(id,{value:'',checked:false,close(){this.closed=true;}});return fields.get(id);},document:{addEventListener(){}},window:{storage:{async set(k,v){writes.push([k,v]);}},fermentCloudSync:{queueSave(){}}},downloadBlob:(...a)=>{c.download=a;}});
  c.seed=batch();vm.runInContext('let batches=[seed],inventory=[];',c);vm.runInContext('window.fermentCloudData={getSnapshot(){return JSON.parse(JSON.stringify({batches,inventory}));}};',c);vm.runInContext(ui,c);
  c.readExpenseDraft=()=>JSON.parse(JSON.stringify(draft));c.renderExpenseDraft=rows=>{draft=JSON.parse(JSON.stringify(rows));};c.setDraft=rows=>draft=rows;c.draft=()=>draft;c.read=()=>c.window.fermentCloudData.getSnapshot();c.run=s=>vm.runInContext(s,c);c.writes=writes;c.exportableBatches=()=>c.read().batches;
  c.run('expenseEditorState={batchId:"b",before:JSON.stringify(window.fermentCloudData.getSnapshot()),removed:[]}');c.$('expenseReason').value='UAT';c.$('expenseReviewed').checked=true;c.setDraft([{...row(),amount:12000}]);return c;
}
test('save persists once; cancel, concurrent changes and quota failure leave originals',async()=>{
  for(const mode of ['save','cancel','stale','during','failure']){
    const c=harness();if(mode==='cancel')c.confirmDataAction=async()=>false;
    if(mode==='stale')c.run('batches[0].batchName="Changed"');
    if(mode==='during')c.confirmDataAction=async()=>{c.run('batches[0].batchName="Changed"');return true;};
    if(mode==='failure')c.window.storage.set=async()=>{throw Error('quota');};
    await c.saveExpenseEditor();assert.equal(c.read().batches[0].otherCosts[0].amount,mode==='save'?12000:10000);assert.equal(c.writes.length,mode==='save'?1:0);assert.equal(c.run('expenseSaving'),false);
  }
});
test('double submit shares one confirmation and one storage write',async()=>{
  const c=harness();let release;c.confirmDataAction=()=>new Promise(r=>release=r);const first=c.saveExpenseEditor();await c.saveExpenseEditor();release(true);await first;assert.equal(c.writes.length,1);assert.equal(c.read().batches[0].otherCostHistory.length,1);
});
test('draft row deletion can be undone before save; addition never saves implicitly',()=>{
  const c=harness();c.removeExpenseDraft('e');assert.equal(c.draft().length,0);assert.equal(c.read().batches[0].otherCosts.length,1);c.undoExpenseRemoval();assert.equal(c.draft()[0].amount,12000);
  c.addExpenseDraft();assert.equal(c.draft().length,2);assert.equal(c.writes.length,0);assert.equal(c.$('expenseReviewed').checked,false);
});
test('CSV contains allocated costs, details, history and incomplete state',()=>{
  const c=harness();c.exportBatchCostsCSV();assert.match(c.download[0],/2000/);assert.match(c.download[0],/小計（未確定）/);assert.match(c.download[0],/INV-01/);
});
test('UI escapes expense content and history',()=>{
  const c=harness(),b=batch();b.otherCosts[0].name='<img src=x>';const result=c.renderExpenseSummary(b,{subtotal:100,complete:true});assert.ok(!result.includes('<img'));assert.match(result,/&lt;img/);
  new vm.Script(ui);new vm.Script(fs.readFileSync(path.join(__dirname,'../batch-expenses.js'),'utf8'));
});
