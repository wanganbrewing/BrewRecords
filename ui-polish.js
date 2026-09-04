let uiFormDirty=false,uiSaving=false;
function updateScreenChrome(name){
  const heading=document.getElementById('screenHeading');
  if(heading)heading.textContent=({inventory:'原材料管理',form:'仕込み',list:'記録一覧',detail:'仕込みの詳細',schedule:'仕込み時間割',fermentation:'発酵管理'})[name]||'Fermenter’s Ledger';
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
    if(input.placeholder&&!input.dataset.exampleReady){
      input.dataset.exampleReady='1';
      const hint=document.createElement('small');hint.className='field-example';hint.textContent='入力例：'+input.placeholder+'（灰色の表示は入力値ではありません）';
      const wrap=input.closest('.number-control')||input;wrap.insertAdjacentElement('afterend',hint);
    }
  });
}
document.addEventListener('DOMContentLoaded',()=>{
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
