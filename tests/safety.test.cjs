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
    persist:async()=>{}, persistInventory:async()=>{},
    resetForm:()=>vm.runInContext('copiedScheduleSteps=[]',c),
    populateFormFields:x=>{c.populated=x;},
  });
  vm.runInContext('let batches=[], inventory=[], editingId=null, lastViewedBatchId=null, formIsOpen=false, copiedScheduleSteps=[];',c);
  vm.runInContext('window.fermentCloudData={getSnapshot(){return JSON.parse(JSON.stringify({schemaVersion:1,batches,inventory}));},async applySnapshot(p){batches=p.batches;inventory=p.inventory;}};',c);
  for(const name of ['invStock','deductInventoryForBatch','syncInventoryForBatch','copyScheduleForNewBatch','duplicateBatch','scaleDuplicateBatch','buildBatchFromForm','saveBatch','preservePackageShipments','prepareDeletion','finishDeletion','undoLastDeletion','deleteInventoryReceipt','deleteInventoryItem','deleteInventoryConsumption','deleteBatch','deleteShipmentLot','csvEscape','exportInventoryCSV']) vm.runInContext(extract(name),c);
  c.INV_CATEGORY_LABEL={hop:'ホップ'};
  vm.runInContext(extract('confirmDataAction'),c);
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
