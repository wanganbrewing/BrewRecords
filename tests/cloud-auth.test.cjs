const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const cloud=fs.readFileSync(path.join(root,'cloud-sync.js'),'utf8');

test('startup login offers a masked demo account and opens isolated demo data',()=>{
  assert.match(html,/id="appLoginId"[^>]+value="デモ"/);
  assert.match(html,/type="password" id="appLoginPassword"[^>]+value="password"/);
  assert.ok(cloud.includes("id==='デモ'&&password==='password'"));
  assert.ok(cloud.includes('demo=1&uat=v112'));
});

test('brewery account authentication uses password auth without persisting passwords',()=>{
  assert.ok(cloud.includes('auth.signInWithPassword({email,password})'));
  assert.ok(cloud.includes('auth.signUp({email,password'));
  assert.ok(cloud.includes('auth.resetPasswordForEmail'));
  assert.ok(cloud.includes('auth.updateUser({password})'));
  assert.ok(!cloud.includes('signInWithOtp'));
  assert.ok(!/localStorage\.setItem\([^\n]*password/i.test(cloud));
  assert.ok(!/window\.storage\.set\([^\n]*password/i.test(cloud));
  assert.match(html,/同じ醸造所のPC・スマートフォンで同じIDとパスワード/);
});
