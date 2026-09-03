const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const extract=name=>{const start=html.search(new RegExp(`(?:async )?function ${name}\\(`));assert.ok(start>=0,name);const rest=html.slice(start);return rest.slice(0,rest.search(/^}/m)+1);};
function app(){
  const fields=new Map(),writes=[];
  const c=vm.createContext({Date,console,uid:(()=>{let n=0;return()=>`new-${++n}`;})(),todayDateValue:()=> '2026-09-03',
    $:id=>{if(!fields.has(id))fields.set(id,{value:'',close(){this.closed=true;}});return fields.get(id);},
    confirmAction:async()=>true,renderInventory(){},renderList(){},renderFormInvDeductArea(){},maybeAutoBackup(){},
    window:{storage:{async set(k,v){writes.push([k,v]);}},fermentCloudSync:{queueSave(){}}},
    INV_CATEGORY_LABEL:{hop:'ホップ'},downloadBlob:(...args)=>{c.download=args;}});
  vm.runInContext('let inventory=[],batches=[],inventorySort="usage",inventoryEditorState=null,inventoryEditSaving=false,editingId=null;',c);
  vm.runInContext('window.fermentCloudData={getSnapshot(){return JSON.parse(JSON.stringify({schemaVersion:1,batches,inventory}));}};',c);
  for(const name of ['invStock','inventoryItemLabel','inventoryUsage','sortInventoryItems','invItemsByCategory','escapeHtml','invSelectOptions','validateInventoryMetadata','inventoryIdentityExists','receiptEditableFields','buildInventoryReceipt','persistInventoryReplacement','confirmDataAction','submitInventoryEditor','receiptCorrectionsHtml','inventoryMetadataHistoryHtml','getInventoryLedgerRows','filterInventoryLedgerRows','csvEscape','exportInventoryCSV'])vm.runInContext(extract(name),c);
  c.run=s=>vm.runInContext(s,c);c.read=()=>c.window.fermentCloudData.getSnapshot();c.writes=writes;
  c.seed=items=>{c.items=items;c.run('inventory=items;batches=[{id:"b",hops:[{invId:"h",amount:10}]}]');};
  return c;
}
const item=()=>({id:'h',name:'Cascade',category:'hop',unit:'g',manufacturer:'Maker A',lotCode:'LOT-1',receipts:[{id:'r',date:'2026-09-01',amount:100,supplier:'Supply',price:2000,custom:'preserve'}],consumptions:[{id:'c',batchId:'b',date:'2026-09-02',amount:10}],adjustments:[{id:'a',date:'2026-09-03',amount:-2,before:90,actual:88,reason:'実地棚卸'}]});
const values={date:'2026-09-01',amount:'120',supplier:'Supply',price:'0'};
function editor(c,mode='receipt'){
  c.run(`inventoryEditorState={mode:'${mode}',itemId:'h',receiptId:${mode==='receipt'?"'r'":'null'},before:JSON.stringify(window.fermentCloudData.getSnapshot())}`);
  for(const [id,value] of Object.entries({invEditDate:values.date,invEditAmount:values.amount,invEditSupplier:values.supplier,invEditPrice:values.price,invEditReason:'納品書で確認',invEditManufacturer:'Maker B',invEditLot:'LOT-2'}))c.$(id).value=value;
}
test('lots have independent identities, balances and unambiguous recipe options',()=>{
  const c=app(),a=item(),b={...item(),id:'h2',lotCode:'LOT-2',receipts:[],consumptions:[],adjustments:[]};c.seed([a,b]);
  assert.equal(c.inventoryIdentityExists({...a,id:'new'}),true);
  assert.equal(c.inventoryIdentityExists({...a,lotCode:'LOT-3'}),false);
  assert.equal(c.inventoryIdentityExists({...a,manufacturer:'Maker B'}),false);
  assert.equal(c.inventoryIdentityExists(a,'h'),false);
  assert.equal(c.invStock(a),88);assert.equal(c.invStock(b),0);
  const options=c.invSelectOptions('hop','h2');assert.match(options,/Maker A ／ Lot LOT-1/);assert.match(options,/value="h2" selected/);
  assert.equal(c.validateInventoryMetadata('  Maker A  ','  LOT-1 ').manufacturer,'Maker A');
  assert.equal(c.validateInventoryMetadata().lotCode,'');
  assert.throws(()=>c.validateInventoryMetadata('x'.repeat(101),''));
});
test('usage counts distinct batches, not staged additions, and sorting does not mutate inventory',()=>{
  const c=app(),a=item(),b={...item(),id:'h2',name:'Alpha',consumptions:[{batchId:'b',amount:2},{batchId:'b',amount:3},{batchId:'b2',amount:0}]};
  a.consumptions.push({batchId:'b2',amount:1});c.seed([b,a]);
  assert.equal(c.inventoryUsage(b),1);assert.equal(c.inventoryUsage(a),2);
  assert.equal(c.sortInventoryItems([b,a])[0].id,'h');assert.equal(c.sortInventoryItems([a,b],'name')[0].id,'h2');
  assert.equal(c.read().inventory[0].id,'h2');
});
test('receipt correction preserves source ID, audit history, stocktake and recipe links',async()=>{
  const c=app();c.seed([item()]);const before=c.read();editor(c);await c.submitInventoryEditor();
  const after=c.read(),r=after.inventory[0].receipts[0];
  assert.equal(r.id,'r');assert.equal(r.custom,'preserve');assert.equal(r.price,0);assert.equal(r.amount,120);
  assert.equal(r.corrections.length,1);assert.equal(r.corrections[0].before.amount,100);assert.equal(r.corrections[0].after.amount,120);
  assert.deepEqual(after.batches,before.batches);assert.deepEqual(after.inventory[0].consumptions,before.inventory[0].consumptions);assert.deepEqual(after.inventory[0].adjustments,before.inventory[0].adjustments);
  assert.equal(c.invStock(after.inventory[0]),108);assert.equal(c.writes.length,1);
  const twice=c.buildInventoryReceipt(after.inventory[0],'r',{...values,amount:130},'追加訂正','now');assert.equal(twice.corrections.length,2);
  assert.equal(after.inventory[0].receipts[0].corrections.length,1);
});
test('receipt validation rejects invalid dates, amounts, prices, reasons and unchanged input',()=>{
  const c=app(),i=item();
  for(const date of ['','2026-02-30','2026-09-04','x'])assert.throws(()=>c.buildInventoryReceipt(i,'r',{...values,date},'reason','now'));
  for(const amount of ['',0,-1,'NaN','Infinity',0.0001,1e10])assert.throws(()=>c.buildInventoryReceipt(i,'r',{...values,amount},'reason','now'));
  for(const price of [-1,'NaN','Infinity',0.001,1e13])assert.throws(()=>c.buildInventoryReceipt(i,'r',{...values,price},'reason','now'));
  assert.throws(()=>c.buildInventoryReceipt(i,'r',values,'','now'));
  assert.throws(()=>c.buildInventoryReceipt(i,'r',values,'x'.repeat(301),'now'));
  assert.throws(()=>c.buildInventoryReceipt(i,'missing',values,'reason','now'));
  assert.throws(()=>c.buildInventoryReceipt(i,'r',c.receiptEditableFields(i.receipts[0]),'reason','now'));
  assert.equal(c.buildInventoryReceipt(i,null,{...values,price:''},'','now').price,'');
  assert.equal(c.buildInventoryReceipt(i,null,values,'','now').price,0);
});
test('cancel, stale form, confirmation-time changes, duplicate submission and storage failure are safe',async()=>{
  for(const scenario of ['cancel','stale','during','duplicate','failure']){
    const c=app();c.seed([item()]);editor(c);const before=c.read();
    if(scenario==='cancel')c.confirmAction=async()=>false;
    if(scenario==='stale')c.run('inventory[0].name="Updated"');
    if(scenario==='during')c.confirmAction=async()=>{c.run('inventory[0].name="Updated"');return true;};
    if(scenario==='failure')c.window.storage.set=async()=>{throw Error('quota');};
    if(scenario==='duplicate'){
      let release;c.confirmAction=()=>new Promise(resolve=>release=resolve);
      const pending=c.submitInventoryEditor();await c.submitInventoryEditor();release(true);await pending;
      assert.equal(c.writes.length,1);assert.equal(c.read().inventory[0].receipts[0].corrections.length,1);
    }else{
      await c.submitInventoryEditor();assert.equal(c.writes.length,0);assert.deepEqual(c.read().inventory[0].receipts,before.inventory[0].receipts);
      if(scenario==='stale'||scenario==='during')assert.equal(c.read().inventory[0].name,'Updated');
      if(scenario==='failure')assert.match(c.$('inventoryEditorError').textContent,/保存できません/);
    }
    assert.equal(c.run('inventoryEditSaving'),false);
  }
});
test('metadata correction retains IDs and records history; duplicate identity is rejected',async()=>{
  const c=app();c.seed([item()]);editor(c,'metadata');await c.submitInventoryEditor();
  const after=c.read();assert.equal(after.inventory[0].id,'h');assert.equal(after.inventory[0].manufacturer,'Maker B');assert.equal(after.batches[0].hops[0].invId,'h');
  assert.equal(after.inventory[0].metadataHistory[0].before.lotCode,'LOT-1');
  assert.match(c.inventoryMetadataHistoryHtml(after.inventory[0]),/LOT-1/);
  const d=app();d.seed([item(),{...item(),id:'other',manufacturer:'Maker B',lotCode:'LOT-2'}]);editor(d,'metadata');await d.submitInventoryEditor();assert.equal(d.writes.length,0);assert.match(d.$('inventoryEditorError').textContent,/登録済み/);
});
test('ledger and CSV include lots and corrections without counting corrected receipts twice',async()=>{
  const c=app();c.seed([item()]);editor(c);await c.submitInventoryEditor();
  const rows=c.getInventoryLedgerRows();assert.equal(rows.length,3);assert.equal(rows[0].amount,120);assert.equal(rows[2].balance,108);
  assert.equal(c.filterInventoryLedgerRows(rows,{category:'',search:'lot-1',from:'',to:''}).length,3);
  assert.equal(c.filterInventoryLedgerRows(rows,{category:'',search:'Maker A',from:'',to:''}).length,3);
  assert.equal(c.filterInventoryLedgerRows(rows,{category:'',search:'Unknown Maker',from:'',to:''}).length,0);
  c.exportInventoryCSV();assert.match(c.download[0],/メーカー,ロット番号/);assert.match(c.download[0],/LOT-1/);assert.match(c.download[0],/納品書で確認/);
  const restored=JSON.parse(c.writes[0][1]);assert.equal(restored[0].receipts[0].corrections[0].before.amount,100);
});
test('correction below consumed amount preserves truthful negative stock and warns before saving',async()=>{
  const c=app();c.seed([item()]);editor(c);c.$('invEditAmount').value='5';let message='';c.confirmAction=async m=>{message=m;return true;};
  await c.submitInventoryEditor();assert.equal(c.invStock(c.read().inventory[0]),-7);assert.match(message,/マイナス/);
});
test('audit display escapes user text rather than injecting HTML',()=>{
  const c=app(),i=item();const r=c.buildInventoryReceipt(i,'r',values,'<img src=x>','now');
  const display=c.receiptCorrectionsHtml(r.corrections,'g');assert.match(display,/&lt;img/);assert.ok(!display.includes('<img'));
});
