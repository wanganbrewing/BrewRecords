const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const Settings=require('../app-settings.js');

test('initial settings normalize defaults and reusable brewery values',()=>{
  assert.deepEqual(Settings.normalize(),{version:1,breweryName:'',staff:[],tankPrefix:'FV',tankCount:8,batchPrefix:'',batchDigits:3,updatedAt:''});
  const settings=Settings.normalize({breweryName:' 醸造所 ',staff:'山田\n佐藤\n山田',tankPrefix:' T-',tankCount:'12',batchPrefix:'B-',batchDigits:'4',updatedAt:'2026-09-07T00:00:00.000Z'});
  assert.equal(settings.breweryName,'醸造所');
  assert.deepEqual(settings.staff,['山田','佐藤']);
  assert.deepEqual(Settings.tankNames(settings).slice(-2),['T-11','T-12']);
  assert.equal(settings.batchPrefix,'B-');
  assert.equal(settings.batchDigits,4);
  assert.equal(Settings.hasActivity(settings),true);
});

test('initial settings reject unsafe ranges and merge by update time',()=>{
  assert.throws(()=>Settings.normalize({tankCount:0}),/1〜30/);
  assert.throws(()=>Settings.normalize({batchDigits:7}),/1〜6/);
  const old=Settings.normalize({breweryName:'旧',updatedAt:'2026-09-01'}),recent=Settings.normalize({breweryName:'新',updatedAt:'2026-09-07'});
  assert.equal(Settings.merge(old,recent).breweryName,'新');
  assert.equal(Settings.merge(recent,old).breweryName,'新');
});

test('hamburger initial settings are stored, synced and backed up',()=>{
  const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8'),version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  assert.ok(html.includes('onclick="openInitialSettings()"'));
  assert.ok(html.includes('id="initialSettingsDialog"'));
  assert.ok(html.includes("window.storage.set('wangan-app-settings'"));
  assert.ok(html.includes('appSettings: AppSettings.normalize(appSettings)'));
  assert.ok(html.includes('appSettings:AppSettings.normalize(appSettings)'));
  assert.ok(html.includes('visibleConfiguredTanks().map'));
  assert.ok(html.includes('list="brewerList"'));
  for(const file of ['index.html','sw.js'])assert.ok(fs.readFileSync(path.join(root,file),'utf8').includes(`app-settings.js?v=${version}`));
  assert.ok(sw.includes('app-settings.js'));
});
