const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const BrewTargets=require('../brew-targets.js');
const InventoryCosting=require('../inventory-costing.js');
const FermentationTanks=require('../fermentation-tanks.js');

function demoData(){
  const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
  const start=html.indexOf('function buildDemoSampleData(){');
  const end=html.indexOf('\n\nasync function seedDemoDataIfNeeded()',start);
  assert.ok(start>=0&&end>start,'demo builder is present');
  const context={BrewTargets,InventoryCosting,FermentationTanks,result:null};
  vm.runInNewContext(`${html.slice(start,end)}\nresult=buildDemoSampleData();`,context);
  return context.result;
}

test('demo includes one clearly labelled end-to-end completed brewing record',()=>{
  const data=demoData();
  const batch=data.batches.find(row=>row.id==='demo-full-pale-lager-083');
  assert.ok(batch);
  assert.match(batch.batchName,/全項目入力済みデモ/);
  assert.equal(batch.completed,true);
  assert.equal(batch.inventoryDeducted,true);
  assert.equal(batch.otherCostsReviewed,true);
  assert.ok(batch.otherCosts.length>=5);
  assert.ok(batch.otherCostHistory.length>=1);
  assert.ok(batch.gravityLog.length>=7);
  assert.ok(batch.gravityLog.every(row=>row.gravity&&row.ph&&row.temp&&row.volume&&row.co2));
  assert.ok(!batch.brewTargets.steps.some(step=>/筑波|Tsukuba|\bLT\b|\bKWT\b/.test(step.name)));
  assert.ok(!batch.customScheduleSteps.some(step=>/筑波|Tsukuba|デコクション/.test(step.label)));
  assert.ok(batch.packages.length>=2);
  assert.ok(batch.packages.every(row=>row.shipments?.length));
  assert.ok(batch.packages.flatMap(row=>row.shipments).some(row=>row.status==='shipped'));
  assert.ok(batch.packages.flatMap(row=>row.shipments).some(row=>row.status==='loss'));
});

test('full demo fills every visible process target and representative actuals',()=>{
  const data=demoData();
  const batch=data.batches.find(row=>row.id==='demo-full-pale-lager-083');
  const plan=BrewTargets.normalize(batch.brewTargets);
  assert.equal(plan.steps.length,BrewTargets.steps.length);
  const bound=new Set(['mashTemp','mashTime','boilTime','targetOG']);
  for(const step of plan.steps){
    for(const slot of step.slots){
      if(bound.has(slot))continue;
      assert.notEqual(step.values[slot]??'', '',`${step.name} ${slot}`);
    }
  }
  for(const key of ['batchNumber','tradeName','productName','tank','mashWater1','mashWater2','spargeWater1','spargeWater2','yeastSource','yeastHarvestDate','targetFG','targetABV','targetIBU','targetSRM'])assert.notEqual(plan.fields[key],'',key);
  assert.equal(plan.fields.doubleBrew,true);
  assert.ok(batch.processMeasurements.length>=20);
  assert.ok(batch.processMeasurements.every(row=>row.stage&&row.date&&row.time&&row.history?.length));
});

test('full demo recipe is linked to matching inventory consumption and a saved valuation',()=>{
  const data=demoData();
  const batch=data.batches.find(row=>row.id==='demo-full-pale-lager-083');
  const recipe=[...batch.fermentables,...batch.hops,...batch.adjuncts,{name:batch.yeast,amount:batch.yeastAmount,invId:batch.yeastInvId}];
  for(const row of recipe){
    const item=data.inventory.find(entry=>entry.id===row.invId);
    assert.ok(item,`${row.name} inventory`);
    const used=item.consumptions.filter(entry=>entry.batchId===batch.id).reduce((sum,entry)=>sum+Number(entry.amount),0);
    const expected=recipe.filter(entry=>entry.invId===row.invId).reduce((sum,entry)=>sum+Number(entry.amount),0);
    assert.equal(used,expected,`${row.name} consumption`);
  }
  assert.equal(data.valuationBook.reports.length,1);
  assert.equal(data.valuationBook.reports[0].month,'2026-08');
});

test('demo yeast inventory and recipe quantities consistently use grams',()=>{
  const data=demoData();
  const yeastItems=data.inventory.filter(item=>item.category==='yeast');
  assert.ok(yeastItems.length>=4);
  assert.ok(yeastItems.every(item=>item.unit==='g'));
  for(const batch of data.batches.filter(row=>row.yeast)){
    assert.equal(batch.yeastUnit,'g');
    assert.ok(Number(batch.yeastAmount)>0);
  }
});

test('demo initial settings use the supplied supplier names and sample operating values',()=>{
  const data=demoData();
  assert.equal(data.appSettings.breweryName,'サンプル醸造所');
  assert.equal(data.appSettings.tankCount,8);
  assert.equal(data.appSettings.defaultBatchSize,'850');
  assert.ok(data.appSettings.staff.length>=3);
  assert.deepEqual(Array.from(data.appSettings.suppliers),['大西商事','片岡物産','E.A.T.','BET','きた産業','セティ','有希化学','ホクセイプロダクツ','昭和貿易']);
  assert.equal(data.appSettings.materialMasters.fermentable.length,22);
  assert.equal(data.appSettings.materialMasters.hop.length,20);
  assert.equal(data.appSettings.materialMasters.yeast.length,26);
  assert.equal(data.appSettings.materialMasters.adjunct.length,18);
  for(const name of ['Weyermann® Pilsner Malt','Weyermann® CARAMUNICH® Type 2'])assert.ok(data.appSettings.materialMasters.fermentable.includes(name));
  for(const name of ['Cascade','Citra®','Hallertauer Mittelfrüh','Saaz'])assert.ok(data.appSettings.materialMasters.hop.includes(name));
  for(const name of ['Fermentis SafAle™ US-05','Fermentis SafLager™ W-34/70','LalBrew® Nottingham™','LalBrew® NovaLager™'])assert.ok(data.appSettings.materialMasters.yeast.includes(name));
  for(const name of ['Weyermann® LME SINAMAR®','Oregon Fruit Passion Fruit Aseptic Puree'])assert.ok(data.appSettings.materialMasters.adjunct.includes(name));
  const suppliers=new Set(data.appSettings.suppliers);
  assert.ok(data.inventory.flatMap(item=>item.receipts||[]).every(receipt=>suppliers.has(receipt.supplier)));
});
