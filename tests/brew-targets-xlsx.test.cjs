const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const X=require('../xlsx.full.min.js');
const B=require('../brew-targets.js');
const M=require('../brew-targets-xlsx.js');
const dir=path.join(__dirname,'..');

function fixture(){
  const plan=B.empty();
  Object.assign(plan.fields,{batchNumber:'WB-82',tradeName:'試験醸造',mashWater1:'100',mashWater2:'20',spargeWater1:'180',targetFG:'1.010',targetABV:'5.2',targetSRM:'8',yeastSource:'fresh pitch',doubleBrew:true});
  plan.steps=[
    {id:'rest1',name:'糖化休止 1',slots:['mashTemp','mashTime'],values:{},gravityUnit:'SG',comparisons:{}},
    {id:'originalGravity',name:'発酵前の比重・pH',slots:['targetOG','plato','ph'],values:{plato:'12.4',ph:'5.2'},gravityUnit:'SG',comparisons:{ph:'='}}
  ];
  return {
    id:'saved-record',batchName:'Excel 試験',style:'Pale Ale',batchIcon:'beer',taxCategory:'ビール・発泡酒等（発泡性酒類）',brewDate:'2026-09-06',brewer:'担当A',batchSize:'280',targetOG:'1.050',actualOG:'1.047',mashTemp:'66',mashTime:'60',boilTime:'75',waterVolume:'120',waterSource:'水道水',waterPh:'7.2',waterAlkalinity:'58',targetWaterPh:'5.4',phAcidType:'phosphoric75',sCa:'18',sMg:'4',sNa:'9',sCl:'22',sSO4:'28',sHCO3:'42',mCa:'75',mMg:'5',mNa:'10',mCl:'70',mSO4:'120',mHCO3:'25',
    fermentables:[{name:'Pale Malt',amount:'80',invId:'m1',targetMeta:{batch1:'70',batch2:'10',manufacturer:'Maltster',lot:'LOT-M'}}],
    hops:[{name:'Cascade',amount:'900',invId:'h1',timingType:'boil',timingValue:'60',targetMeta:{batch1:'800',batch2:'100',manufacturer:'Hop Farm',lot:'2026-A',alpha:'6.2',ibu:'28'}}],
    adjuncts:[{name:'FermAid K',amount:'320',unit:'g',timing:'煮沸中',targetMeta:{batch1:'320',batch2:'',manufacturer:'Maker',lot:'A1',timingNote:'終了1分前'}}],
    minerals:[{name:'石膏（CaSO4）',amount:'64',timing:'仕込み水',targetMeta:{batch1:'64',batch2:'',concentration:''}}],
    yeast:'S-23',yeastAmount:'690',yeastUnit:'g',yeastInvId:'y1',
    fermentStart:'2026-09-06',gravityLog:[{date:'2026-09-07',gravity:'1.044',ph:'4.7'}],inventoryDeducted:true,packages:[{type:'樽',quantity:'10'}],brewTargets:plan
  };
}
const inventory=[
  {id:'m1',category:'fermentable',name:'Pale Malt',manufacturer:'Maltster',lotCode:'LOT-M',unit:'kg'},
  {id:'h1',category:'hop',name:'Cascade',manufacturer:'Hop Farm',lotCode:'2026-A',unit:'g'},
  {id:'y1',category:'yeast',name:'S-23',manufacturer:'',lotCode:'',unit:'g'}
];
function roundTrip(batch=fixture(),stock=inventory){const wb=M.buildWorkbook(batch,stock,{xlsx:X,appVersion:82,exportedAt:'2026-09-06T00:00:00.000Z'}),data=X.write(wb,{type:'array',bookType:'xlsx',compression:true});return {wb,result:M.parseWorkbook(data,stock,{xlsx:X})};}

test('workbook has the four documented editable sheets and typed target cells',()=>{
  const {wb}=roundTrip();assert.deepEqual(wb.SheetNames,M.SHEETS);
  const basic=X.utils.sheet_to_json(wb.Sheets['基本計画'],{defval:''});
  assert.equal(basic.find(row=>row['管理キー']==='batchSize')['値'],280);
  assert.equal(basic.find(row=>row['管理キー']==='targetOG')['値'],1.05);
  assert.equal(X.utils.sheet_to_json(wb.Sheets['管理情報'],{defval:''}).find(row=>row['項目']==='formatId')['値'],M.FORMAT_ID);
});

test('round trip preserves all planned sheets while clearing actuals and ledger effects',()=>{
  const {result}=roundTrip(),b=result.batch;
  assert.equal(b.batchName,'Excel 試験');assert.equal(b.batchIcon,'auto');assert.equal(b.taxCategory,'ビール・発泡酒等(発泡性酒類)');assert.equal(b.targetOG,'1.05');assert.equal(b.mashTemp,'66');assert.equal(b.waterVolume,'120');assert.equal(b.phAcidType,undefined);assert.equal(b.sCa,'');assert.equal(b.sHCO3,'');
  assert.equal(b.brewTargets.fields.targetSRM,'8');assert.equal(b.brewTargets.fields.yeastSource,'fresh pitch');
  assert.equal(b.brewTargets.fields.batchNumber,'WB-82');assert.equal(b.brewTargets.fields.doubleBrew,true);assert.equal(b.brewTargets.steps[1].values.ph,'5.2');
  assert.equal(b.fermentables[0].amount,'80');assert.equal(b.fermentables[0].invId,'m1');assert.equal(b.hops[0].targetMeta.alpha,'6.2');assert.equal(b.yeastInvId,'y1');
  assert.equal(b.actualOG,'');assert.equal(b.fermentStart,'');assert.deepEqual(b.gravityLog,[]);assert.deepEqual(b.packages,[]);assert.equal(b.inventoryDeducted,false);assert.deepEqual(b.processMeasurements,[]);
  assert.equal(result.summary.materialCount,4);assert.equal(result.summary.targetStepCount,2);assert.equal(result.summary.sourceAppVersion,'82');assert.deepEqual(result.warnings,[]);
});

test('edited Excel values are imported by stable keys and not by row position',()=>{
  const wb=M.buildWorkbook(fixture(),inventory,{xlsx:X,appVersion:82});
  const rows=X.utils.sheet_to_json(wb.Sheets['基本計画'],{defval:''});
  rows.reverse();rows.find(row=>row['管理キー']==='batchName')['値']='Excelで変更';rows.find(row=>row['管理キー']==='targetOG')['値']=1.062;
  wb.Sheets['基本計画']=X.utils.json_to_sheet(rows,{header:M.FIELD_DEFS.length?['区分','項目','値','単位','管理キー']:[]});
  const result=M.parseWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),inventory,{xlsx:X});assert.equal(result.batch.batchName,'Excelで変更');assert.equal(result.batch.targetOG,'1.062');
});

test('inventory IDs are never trusted and unmatched rows become unlinked with warnings',()=>{
  const batch=fixture(),wrong=[{id:'m1',category:'fermentable',name:'Different',manufacturer:'Maltster',lotCode:'LOT-M',unit:'kg'}],wb=M.buildWorkbook(batch,inventory,{xlsx:X,appVersion:82}),data=X.write(wb,{type:'array',bookType:'xlsx'}),result=M.parseWorkbook(data,wrong,{xlsx:X});
  assert.equal(result.batch.fermentables[0].invId,undefined);assert.ok(result.warnings.some(w=>w.includes('Pale Malt')));
  assert.equal(result.batch.hops[0].invId,undefined);assert.equal(result.batch.yeastInvId,undefined);
});

test('unsupported or damaged workbooks are rejected before producing a draft',()=>{
  const wb=M.buildWorkbook(fixture(),inventory,{xlsx:X});delete wb.Sheets['管理情報'];wb.SheetNames=wb.SheetNames.filter(name=>name!=='管理情報');
  assert.throws(()=>M.parseWorkbook(X.write(wb,{type:'array',bookType:'xlsx'}),inventory,{xlsx:X}),/管理情報/);
  const valid=M.buildWorkbook(fixture(),inventory,{xlsx:X}),info=X.utils.sheet_to_json(valid.Sheets['管理情報'],{defval:''});info.find(row=>row['項目']==='schemaVersion')['値']=99;valid.Sheets['管理情報']=X.utils.json_to_sheet(info,{header:['項目','値']});
  assert.throws(()=>M.parseWorkbook(X.write(valid,{type:'array',bookType:'xlsx'}),inventory,{xlsx:X}),/対応している/);
});

test('formula-like user text stays a text cell and survives a round trip',()=>{
  const batch=fixture();batch.batchName='=HYPERLINK("bad")';const {wb,result}=roundTrip(batch);const row=X.utils.sheet_to_json(wb.Sheets['基本計画'],{defval:''}).find(item=>item['管理キー']==='batchName');assert.equal(row['値'],'=HYPERLINK("bad")');assert.equal(result.batch.batchName,'=HYPERLINK("bad")');
});

test('browser app loads the vendored pinned library and workbook module',()=>{
  const html=fs.readFileSync(path.join(dir,'index.html'),'utf8'),vendor=fs.readFileSync(path.join(dir,'xlsx.full.min.js'));
  const v=JSON.parse(fs.readFileSync(path.join(dir,'version.json'),'utf8')).version;assert.ok(html.includes(`xlsx.full.min.js?v=${v}`));assert.ok(html.includes(`brew-targets-xlsx.js?v=${v}`));assert.ok(vendor.length>900000);assert.equal(X.version,'0.20.3');
});
