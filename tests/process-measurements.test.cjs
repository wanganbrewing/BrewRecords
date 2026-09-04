const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('../process-measurements.js');
const ui=fs.readFileSync(path.join(__dirname,'../process-measurements-ui.js'),'utf8');
const sample=()=>({stage:'糖化終了',date:'2026-09-04',time:'10:30',gravity:1.042,ph:5.2,temperature:65,volume:20,note:'別鍋'});
test('measurements distinguish empty fields from zero and accept independent observations',()=>{
  const s=P.normalize({...sample(),gravity:'',ph:0,temperature:0,volume:0},'2026-09-04');assert.equal(s.gravity,'');assert.equal(s.ph,0);assert.equal(s.temperature,0);assert.equal(s.volume,0);
  const b=P.revise({},null,sample(),'測定','2026-09-04','r1','now'),b2=P.revise(b,null,sample(),'再測定','2026-09-04','r2','later');assert.equal(b2.processMeasurements.length,2);assert.equal(b.processMeasurements.length,1);
});
test('validates dates, time, precision and ranges without inventing missing measurements',()=>{
  for(const change of [{stage:''},{date:''},{date:'2026-02-30'},{date:'2026-09-05'},{time:'25:00'},{gravity:0},{gravity:1.999},{gravity:1.0001},{ph:14.01},{temperature:-11},{volume:-1},{volume:0.0001},{ph:'NaN'},{volume:Infinity},{note:'x'.repeat(301)}])assert.throws(()=>P.normalize({...sample(),...change},'2026-09-04'));
  assert.throws(()=>P.normalize({...sample(),gravity:'',ph:'',temperature:'',volume:''},'2026-09-04'));
  assert.equal(P.normalize({...sample(),time:''},'2026-09-04').time,'');
});
test('correction preserves ID and immutable before/after history; safeguards malformed and stale selections',()=>{
  const b=P.revise({actualOG:1.05,gravityLog:[{gravity:1.01}],customScheduleSteps:[{label:'別鍋'}]},null,sample(),'測定','2026-09-04','r','now');
  const original=JSON.stringify(b),next=P.revise(b,'r',{...sample(),ph:5.3},'入力訂正','2026-09-04','unused','later');assert.equal(next.processMeasurements[0].id,'r');assert.equal(next.processMeasurements[0].history[1].before.ph,5.2);assert.equal(next.processMeasurements[0].history[1].after.ph,5.3);assert.equal(JSON.stringify(b),original);assert.equal(next.actualOG,b.actualOG);assert.deepEqual(next.gravityLog,b.gravityLog);
  assert.throws(()=>P.revise(b,'missing',sample(),'訂正','2026-09-04','x','now'));assert.throws(()=>P.revise(b,'r',sample(),'変更なし','2026-09-04','x','now'));assert.throws(()=>P.revise(b,null,sample(),'x'.repeat(301),'2026-09-04','x','now'));assert.throws(()=>P.revise({processMeasurements:{}},null,sample(),'追加','2026-09-04','x','now'));
});
function harness(){
  const els=new Map(),writes=[],c=vm.createContext({ProcessMeasurements:P,console,Date,uid:()=> 'new',todayDateValue:()=> '2026-09-04',escapeHtml:s=>String(s??'').replaceAll('<','&lt;').replaceAll('>','&gt;'),document:{addEventListener(){}},$:id=>{if(!els.has(id))els.set(id,{value:'',hidden:true,dataset:{},close(){this.closed=true;}});return els.get(id);},window:{storage:{async set(k,v){writes.push([k,v]);}},fermentCloudSync:{queueSave(){}}},confirmDataAction:async()=>true,maybeAutoBackup(){},currentScheduleBatch:()=>null,openDetail(){},downloadBlob:(...args)=>c.download=args,alert:m=>c.message=m});
  vm.runInContext('let batches=[{id:"b",batchName:"Test",actualOG:1.05}],inventory=[];',c);vm.runInContext('window.fermentCloudData={getSnapshot:()=>({batches,inventory})};',c);vm.runInContext(ui,c);vm.runInContext(fs.readFileSync(path.join(__dirname,'../batch-expenses-ui.js'),'utf8'),c);
  c.run=s=>vm.runInContext(s,c);c.read=()=>JSON.parse(JSON.stringify(c.window.fermentCloudData.getSnapshot()));c.exportableBatches=()=>c.read().batches;c.writes=writes;
  c.run('processEditor={batchId:"b",recordId:null,before:JSON.stringify(window.fermentCloudData.getSnapshot())}');
  for(const [id,value] of Object.entries({processStage:'糖化終了',processDate:'2026-09-04',processTime:'10:30',processNote:'別鍋',processReason:'測定',pm_gravity:'1.042',pm_ph:'5.2',pm_temperature:'65',pm_volume:'20'}))c.$(id).value=value;return c;
}
test('optional correction reasons retain automatic history and existing reasons',async()=>{
  const c=harness();await c.saveProcessEditor();let b=c.read().batches[0];assert.equal(b.processMeasurements[0].history[0].reason,'');
  c.run('processEditor={batchId:"b",recordId:"new",before:JSON.stringify(window.fermentCloudData.getSnapshot())}');c.$('processReason').value='';c.$('pm_ph').value='5.3';await c.saveProcessEditor();b=c.read().batches[0];
  assert.equal(b.processMeasurements[0].history.length,2);assert.equal(b.processMeasurements[0].history[1].before.ph,5.2);assert.equal(b.processMeasurements[0].history[1].after.ph,5.3);assert.ok(b.processMeasurements[0].history[1].recordedAt);
  const old=P.revise({},null,sample(),'以前の理由','2026-09-04','r','now'),next=P.revise(old,'r',{...sample(),ph:5.4},'   ','2026-09-04','x','later');assert.equal(next.processMeasurements[0].history[0].reason,'以前の理由');assert.equal(next.processMeasurements[0].history[1].reason,'');
});
test('reason field is hidden for new records and shown optionally for corrections',()=>{
  const c=harness();c.computeScheduleSteps=()=>[];c.enhanceNumberInputs=()=>{};c.$('processDialog').showModal=()=>{};c.$('processStage').focus=()=>{};
  c.openProcessEditor('b');assert.equal(c.$('processReasonField').hidden,true);
  c.run('batches[0].processMeasurements=[{id:"r",stage:"糖化終了",ph:5.2}]');c.openProcessEditor('b','r');assert.equal(c.$('processReasonField').hidden,false);assert.equal(c.$('processReason').value,'');
});
test('save is guarded against cancellation, concurrency and storage failure',async()=>{
  for(const mode of ['save','cancel','stale','during','failure']){
    const c=harness();if(mode==='cancel')c.confirmDataAction=async()=>false;if(mode==='stale')c.run('batches[0].batchName="Changed"');if(mode==='during')c.confirmDataAction=async()=>{c.run('batches[0].batchName="Changed"');return true;};if(mode==='failure')c.window.storage.set=async()=>{throw Error('quota');};
    await c.saveProcessEditor();assert.equal(c.read().batches[0].processMeasurements?.length||0,mode==='save'?1:0);assert.equal(c.writes.length,mode==='save'?1:0);assert.equal(c.read().batches[0].actualOG,1.05);assert.equal(c.run('processSaving'),false);
  }
});
test('double save creates one observation and does not rerender unsaved schedule fields',async()=>{
  const c=harness();let resolve;c.confirmDataAction=()=>new Promise(r=>resolve=r);c.currentScheduleBatch=()=>({id:'b'});let rendered=0;c.renderProcessMeasurements=()=>rendered++;
  const first=c.saveProcessEditor();await c.saveProcessEditor();resolve(true);await first;assert.equal(c.writes.length,1);assert.equal(rendered,1);
});
test('CSV includes all measurements and audit history and safely handles formulas; UI escapes labels',async()=>{
  const c=harness();c.$('processStage').value='=1+1';await c.saveProcessEditor();c.exportProcessMeasurementsCSV();assert.match(c.download[0],/'=1\+1/);assert.match(c.download[0],/1.042,5.2,65,20/);assert.match(c.download[0],/before/);assert.equal(c.writes.length,1);
  const b=c.read().batches[0];b.processMeasurements[0].stage='<img>';assert.ok(!c.processMeasurementsHtml(b).includes('<img>'));assert.match(c.processMeasurementsHtml(b),/&lt;img&gt;/);
});
test('empty and malformed records are not exported as a successful empty report',()=>{
  const c=harness();c.exportProcessMeasurementsCSV();assert.equal(c.download,undefined);assert.match(c.message,/ありません/);c.run('batches[0].processMeasurements={}');c.exportProcessMeasurementsCSV();assert.equal(c.download,undefined);assert.match(c.message,/不正/);
});
test('measurement scripts are included in the release cache',()=>{
  const root=path.join(__dirname,'..'),v=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  for(const file of ['index.html','sw.js']){const source=fs.readFileSync(path.join(root,file),'utf8');for(const script of ['process-measurements.js','process-measurements-ui.js'])assert.ok(source.includes(`${script}?v=${v}`));}
});
