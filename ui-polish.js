let uiFormDirty=false,uiSaving=false;
let uiDataLoaded=false,welcomeDismissedThisVisit=false;
function welcomeDismissKey(){return 'ferment-welcome-dismissed-v1'+(typeof DEMO_MODE!=='undefined'&&DEMO_MODE?'-demo':'');}
function welcomeWasDismissed(){
  if(welcomeDismissedThisVisit)return true;
  try{return localStorage.getItem(welcomeDismissKey())==='1';}catch(error){return false;}
}
function updateWelcomeState(){
  if(!uiDataLoaded)return;
  const emptyInventory=inventory.length===0;
  const panel=document.getElementById('welcomePanel');
  if(panel)panel.hidden=!(emptyInventory&&batches.length===0&&!welcomeWasDismissed());
  const guide=document.getElementById('inventoryEmptyGuide');if(guide)guide.hidden=!emptyInventory;
  const intro=document.querySelector('#viewInventory .inventory-ledger-head');if(intro)intro.hidden=emptyInventory;
  const sort=document.getElementById('inventorySortControl');if(sort)sort.hidden=emptyInventory||(typeof inventoryMode!=='undefined'&&inventoryMode==='ledger');
}
function dismissWelcome(){
  welcomeDismissedThisVisit=true;
  try{localStorage.setItem(welcomeDismissKey(),'1');}catch(error){}
  updateWelcomeState();
  document.querySelector('.tab[data-tab="inventory"]')?.focus();
}
function startWelcomeBatch(){
  if(typeof formIsOpen!=='undefined'&&formIsOpen)showView('form',false);
  else openNewForm();
  document.getElementById('f_batchName')?.focus();
}
function startWelcomeInventory(){
  dismissWelcome();setInventoryMode('cards');
  const firstCategory=document.querySelector('#inventoryCards summary');
  firstCategory?.scrollIntoView({block:'center'});firstCategory?.focus();
}
function openExportDialog(){
  const dialog=document.getElementById('exportDialog');if(!dialog||dialog.open)return;
  toggleDataMenu(false);dialog.showModal();syncModalState();
}
function closeExportDialog(){document.getElementById('exportDialog')?.close();}
function updateScreenChrome(name){
  const heading=document.getElementById('screenHeading');
  if(heading)heading.textContent=({inventory:'在庫と入荷・使用を管理する',form:'仕込みの内容を入力する',list:'保存した仕込みを確認する',detail:'仕込みの詳細',schedule:'工程の予定と実績を記録する',fermentation:'日々の発酵を記録する'})[name]||"Fermenter's Ledger";
  const toolbar=document.getElementById('editorToolbar');
  if(toolbar)toolbar.hidden=name!=='form';
}
function updateEditorStatus(message){
  const status=document.getElementById('editorStatus');if(status)status.textContent=message;
}
async function saveFromEditor(){
  if(uiSaving)return;
  uiSaving=true;updateEditorStatus('保存しています…');
  const buttons=[...document.querySelectorAll('[data-editor-save]')];buttons.forEach(b=>b.disabled=true);
  try{
    await saveBatch();
    if(!formIsOpen){uiFormDirty=false;updateEditorStatus('端末への保存が完了しました。クラウド同期の状態はメニューで確認できます。');}
    else updateEditorStatus('入力内容を確認してください。まだ保存されていません。');
  }catch(error){updateEditorStatus('保存できませんでした。入力内容を残しています。もう一度お試しください。');}
  finally{uiSaving=false;buttons.forEach(b=>b.disabled=false);}
}
function cancelFromEditor(){
  if(uiSaving)return;
  if(uiFormDirty&&!confirm('入力中の変更を破棄しますか？保存済みの記録は削除されません。'))return;
  uiFormDirty=false;cancelForm();updateEditorStatus('編集内容は「保存」で確定します。');
}
function prepareInputHints(root){
  root.querySelectorAll('input[type=number]').forEach(input=>{
    const step=input.getAttribute('step');
    input.setAttribute('inputmode',step&&step!=='1'?'decimal':'numeric');
  });
}
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('exportDialog').addEventListener('close',()=>{
    toggleDataMenu(true);document.getElementById('openExportButton')?.focus();
  });
  const form=document.getElementById('viewForm');
  ['input','change'].forEach(type=>form.addEventListener(type,event=>{
    if(event.target.matches('input,textarea,select')){uiFormDirty=true;updateEditorStatus('未保存の変更があります。基本・詳細をまとめて保存します。');}
  }));
  form.addEventListener('click',event=>{if(event.target.closest('.add-row-btn,.icon-btn,button[onclick="openFormExpenses()"]')){uiFormDirty=true;updateEditorStatus('編集内容はまだ保存されていません。');}});
  prepareInputHints(document);updateScreenChrome(typeof currentTab==='string'?currentTab:'inventory');
  new MutationObserver(records=>{
    if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&!node.classList.contains('field-example'))))prepareInputHints(document);
  }).observe(form,{childList:true,subtree:true});
});
