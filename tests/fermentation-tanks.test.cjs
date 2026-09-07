const {test}=require('node:test');
const assert=require('node:assert/strict');
const Tanks=require('../fermentation-tanks.js');

function complete(method=''){
  return {done:true,date:'2026-09-07',person:'担当A',method};
}

test('FV1 through FV8 are present by default and custom tanks can be added',()=>{
  const book=Tanks.defaultBook();
  assert.deepEqual(book.tanks.map(tank=>tank.name),['FV1','FV2','FV3','FV4','FV5','FV6','FV7','FV8']);
  const added=Tanks.add(book,'熟成タンクA','custom-a');
  assert.equal(added.tanks.at(-1).name,'熟成タンクA');
  assert.throws(()=>Tanks.add(added,' 熟成タンクA ','custom-b'),/登録済み/);
});

test('a tank becomes fill-ready only after every dated and assigned step is complete',()=>{
  const tank=Tanks.defaultBook().tanks[0];
  assert.equal(Tanks.status(tank),'未清掃');
  tank.steps.water=complete();
  assert.equal(Tanks.status(tank),'水洗い');
  tank.steps.alkali=complete();
  assert.equal(Tanks.status(tank),'アルカリ洗浄済');
  tank.steps.rinse=complete();
  assert.equal(Tanks.status(tank),'リンス');
  tank.steps.sanitize=complete('熱湯');
  assert.equal(Tanks.status(tank),'充てん可能');
  tank.steps.water.person='';
  assert.equal(Tanks.status(tank),'殺菌済（工程未完了）');
});

test('sanitization method and responsible person are required for completion',()=>{
  const tank=Tanks.defaultBook().tanks[0];
  for(const key of Tanks.stepKeys)tank.steps[key]=complete(key==='sanitize'?'殺菌剤':'');
  tank.steps.sanitize.method='';
  assert.equal(Tanks.status(tank),'リンス');
  tank.steps.sanitize.method='殺菌剤';
  tank.steps.sanitize.person='';
  assert.equal(Tanks.status(tank),'リンス');
  tank.steps.sanitize.date='2026-02-30';
  assert.throws(()=>Tanks.normalize({version:1,tanks:[tank]}),/日付/);
});

test('reset clears records and fixed FV tanks cannot be removed',()=>{
  let book=Tanks.defaultBook();
  book.tanks[0].steps.water=complete();
  book=Tanks.reset(book,book.tanks[0].id);
  assert.equal(Tanks.status(book.tanks[0]),'未清掃');
  assert.throws(()=>Tanks.remove(book,book.tanks[0].id),/削除できません/);
  book=Tanks.add(book,'横型タンク','custom-c');
  book=Tanks.remove(book,'custom-c');
  assert.equal(Tanks.findByName(book,'横型タンク'),null);
});

test('merge keeps the newest tank status and reports real activity only',()=>{
  const local=Tanks.defaultBook(),remote=Tanks.defaultBook();
  assert.equal(Tanks.hasActivity(local),false);
  local.tanks[1].updatedAt='2026-09-06T01:00:00Z';
  local.tanks[1].steps.water=complete();
  remote.tanks[1].updatedAt='2026-09-07T01:00:00Z';
  remote.tanks[1].steps.water=complete();remote.tanks[1].steps.alkali=complete();
  const merged=Tanks.merge(local,remote);
  assert.equal(Tanks.status(Tanks.findByName(merged,'FV2')),'アルカリ洗浄済');
  assert.equal(Tanks.hasActivity(merged),true);
});
