const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const styles=require('../beer-style-guide.js');

const root=path.join(__dirname,'..');

test('official 2024 style reference is bundled with all five nearby guide metrics',()=>{
  assert.ok(styles.length>=180);
  const ipa=styles.find(style=>style.id==='101');
  assert.ok(ipa);
  assert.equal(ipa.name,'アメリカンスタイル・インディア・ペールエール');
  assert.match(ipa.og,/1\.060-1\.070/);
  assert.match(ipa.fg,/1\.010-1\.016/);
  assert.match(ipa.abv,/6\.3-7\.5/);
  assert.match(ipa.ibu,/50-70/);
  assert.match(ipa.srm,/4-12/);
  assert.match(ipa.url,/beertaster\.org\/beerstyle\/2404_detail/);
});

test('style guide and mobile process actual entry ship in the current release',()=>{
  const version=JSON.parse(fs.readFileSync(path.join(root,'version.json'),'utf8')).version;
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  const ui=fs.readFileSync(path.join(root,'brew-targets-ui.js'),'utf8');
  assert.ok(html.includes(`beer-style-guide.js?v=${version}`));
  assert.ok(sw.includes(`beer-style-guide.js?v=${version}`));
  assert.ok(ui.includes("metric('OG',style.og)"));
  assert.ok(ui.includes("metric('FG',style.fg)"));
  assert.ok(ui.includes("metric('ABV',style.abv)"));
  assert.ok(ui.includes("metric('IBU',style.ibu)"));
  assert.ok(ui.includes("metric('SRM',style.srm)"));
  assert.ok(ui.includes('スタイルガイド参考値（入力値ではありません）'));
  assert.ok(ui.includes('入力枠とは連携せず'));
  assert.ok(ui.includes('data-target-process-actual'));
});
