(function(){
  'use strict';

  const config = window.FERMENTERS_LEDGER_CLOUD || {};
  const state = {
    client: null,
    session: null,
    organizationId: '',
    revision: 0,
    saveTimer: null,
    applyingRemote: false,
    busy: false,
    conflict: false,
    scopeMismatch: false,
    changeCounter: 0,
    enabled: Boolean(config.enabled && config.supabaseUrl && config.supabasePublishableKey)
  };

  const byId = id => document.getElementById(id);
  const deviceId = getOrCreateDeviceId();
  const pendingKey = 'ferment-cloud-pending-v1';
  const localOrganizationKey = 'ferment-cloud-local-organization';

  function hasPendingChanges(){ return localStorage.getItem(pendingKey)==='1'; }
  function markPending(){ localStorage.setItem(pendingKey, '1'); }
  function markSynced(){
    localStorage.setItem(pendingKey, '0');
    localStorage.setItem(localOrganizationKey, state.organizationId);
  }

  function getOrCreateDeviceId(){
    const key = 'ferment-cloud-device-id';
    let value = localStorage.getItem(key);
    if(!value){
      value = (crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(key, value);
    }
    return value;
  }

  function revisionKey(){
    return state.organizationId ? `ferment-cloud-revision:${state.organizationId}` : '';
  }

  function setStoredRevision(value){
    state.revision = Number(value) || 0;
    if(revisionKey()) localStorage.setItem(revisionKey(), String(state.revision));
  }

  function getStoredRevision(){
    return revisionKey() ? Number(localStorage.getItem(revisionKey()) || 0) : 0;
  }

  function setStatus(kind, badgeText, summary, detail){
    const badge = byId('cloudSyncBadge');
    const summaryEl = byId('cloudSyncSummary');
    const detailEl = byId('cloudSyncDialogStatus');
    if(badge){
      badge.className = `sync-status-badge${kind ? ` ${kind}` : ''}`;
      badge.textContent = badgeText;
    }
    if(summaryEl) summaryEl.textContent = summary;
    if(detailEl) detailEl.textContent = detail || summary;
  }

  function refreshControls(){
    const signedIn = Boolean(state.session);
    const fields = byId('cloudLoginFields');
    const login = byId('cloudLoginButton');
    const sync = byId('cloudSyncNowButton');
    const logout = byId('cloudLogoutButton');
    if(fields) fields.hidden = !state.enabled || signedIn;
    if(login) login.hidden = !state.enabled || signedIn;
    if(sync) sync.hidden = !state.enabled || !signedIn;
    if(logout) logout.hidden = !state.enabled || !signedIn;
  }

  function configureUnavailableUi(){
    if(new URLSearchParams(location.search).get('demo') === '1'){
      setStatus('', 'デモ用', 'デモ版ではクラウド同期しません', 'サンプルデータは通常版の記録・クラウドとは分離されています。');
      refreshControls();
      return;
    }
    setStatus('', '準備中', '端末内へ保存しています', 'クラウド同期の接続先はまだ設定されていません。現在も端末内への保存は通常どおり利用できます。');
    refreshControls();
  }

  async function ensureOrganization(){
    const requestedUserId = state.session?.user?.id;
    const {data, error} = await state.client.rpc('create_personal_organization', {
      organization_name: '個人ワークスペース'
    });
    if(error) throw error;
    if(requestedUserId!==state.session?.user?.id) throw new Error('session_changed');
    state.organizationId = data;
    const localOrganization = localStorage.getItem(localOrganizationKey);
    state.scopeMismatch = Boolean(localOrganization && localOrganization!==data && window.fermentCloudData.hasLocalData());
    if(!state.scopeMismatch) localStorage.setItem(localOrganizationKey, data);
    setStoredRevision(getStoredRevision());
  }

  async function fetchRemote(){
    const {data, error} = await state.client
      .from('app_snapshots')
      .select('payload, revision, updated_at, device_id')
      .eq('organization_id', state.organizationId)
      .single();
    if(error) throw error;
    return data;
  }

  function remoteHasData(remote){
    const payload = remote && remote.payload;
    return Boolean(payload && ((Array.isArray(payload.batches) && payload.batches.length) || (Array.isArray(payload.inventory) && payload.inventory.length) || payload.valuationBook?.reports?.length || payload.valuationBook?.autoEnabled));
  }

  async function applyRemote(remote){
    const payload=remote.payload||{schemaVersion:1,batches:[],inventory:[]};
    const prepared=window.fermentCloudData.prepareRemoteSnapshot?window.fermentCloudData.prepareRemoteSnapshot(payload):{payload,needsSave:false};
    state.applyingRemote = true;
    try{
      await window.fermentCloudData.applySnapshot(prepared.payload);
      setStoredRevision(remote.revision);
      markSynced();
      state.conflict = false;
    }finally{
      state.applyingRemote = false;
    }
    if(prepared.needsSave)window.fermentCloudSync.queueSave();
  }

  async function saveNow(options){
    const manual = Boolean(options && options.manual);
    if(!state.enabled || !state.session || !state.organizationId || state.scopeMismatch || state.applyingRemote || state.busy || (state.conflict && !manual)) return;
    if(!navigator.onLine){
      setStatus('syncing', '同期待ち', 'オフライン：端末内へ保存済み', '通信が戻ったときにクラウドへ自動保存します。');
      return;
    }

    state.busy = true;
    const sentCounter = state.changeCounter;
    const sentOrganization = state.organizationId;
    const sentUser = state.session.user.id;
    setStatus('syncing', '同期中', 'クラウドへ保存しています', '端末内への保存は完了しています。クラウドへ送信中です。');
    try{
      const snapshot = window.fermentCloudData.getSnapshot();
      const {data, error} = await state.client.rpc('save_app_snapshot', {
        target_organization_id: state.organizationId,
        snapshot_payload: snapshot,
        expected_revision: state.revision,
        source_device_id: deviceId
      });
      if(state.organizationId!==sentOrganization || state.session?.user?.id!==sentUser) return;
      if(error) throw error;
      setStoredRevision(data);
      if(sentCounter===state.changeCounter){
        state.conflict = false;
        markSynced();
        setStatus('connected', '同期済み', '端末内・クラウドへ保存済み', `クラウド同期は正常です。更新番号 ${state.revision}`);
      }else{
        setStatus('syncing', '同期待ち', '追加の変更をクラウドへ保存します');
      }
    }catch(error){
      const conflict = String(error && (error.message || error.details || error)).includes('sync_conflict');
      if(conflict){
        state.conflict = true;
        setStatus('error', '選択が必要', 'PC・スマホの両方で変更されています', '自動同期を一時停止しています。「今すぐ同期」を押し、クラウド版とこの端末版のどちらを残すか確認してください。');
        if(manual) await resolveConflict();
      }else if(String(error && error.message).includes('permission_denied')){
        state.conflict = true;
        setStatus('error', '保存権限なし', 'クラウドへの編集権限がありません', 'このアカウントではクラウドへ保存できません。端末内の変更は保持しています。管理者に権限を確認してください。');
      }else{
        console.error('cloud save error', error);
        setStatus('error', '再試行待ち', '端末内へ保存済み・クラウド保存待ち', 'クラウドへの保存に失敗しました。通信回復後に再試行します。');
      }
    }finally{
      state.busy = false;
      if(sentCounter!==state.changeCounter && hasPendingChanges() && !state.conflict){
        clearTimeout(state.saveTimer);
        state.saveTimer = setTimeout(()=>saveNow({manual:false}), 1200);
      }
    }
  }

  async function resolveConflict(){
    const before = JSON.stringify(window.fermentCloudData.getSnapshot());
    const remote = await fetchRemote();
    if(before!==JSON.stringify(window.fermentCloudData.getSnapshot())){
      setStatus('error', '選択が必要', '確認中に端末のデータが変更されました', '保存が終わってから、もう一度「今すぐ同期」を押してください。');
      return;
    }
    const useRemote = confirm('PC・スマホの両方で同じデータが変更されています。\n\nOK：クラウドに保存されている最新版をこの端末へ取り込む\nキャンセル：この端末の内容を残す（クラウドへの保存は保留）');
    if(useRemote){
      // 競合解決で端末版を置き換える前に、通常の自動バックアップとは別に退避。
      await window.storage.set('wangan-before-cloud-replace', before, false);
      if(before!==JSON.stringify(window.fermentCloudData.getSnapshot())){
        state.conflict = true;
        setStatus('error', '選択が必要', '退避中に端末のデータが変更されました', '端末版を保持しました。もう一度「今すぐ同期」を押してください。');
        return;
      }
      await applyRemote(remote);
      setStatus('connected', '同期済み', 'クラウドの最新版を取り込みました', `クラウド同期は正常です。更新番号 ${state.revision}`);
    }
  }

  async function reconcile(){
    if(!state.session || !state.organizationId || state.busy) return;
    if(state.scopeMismatch){
      setStatus('error', 'アカウント確認', '別のワークスペースの端末データがあります', '誤送信を防ぐため同期を停止しました。元のアカウントでログインするか、別のブラウザープロファイルを使ってください。');
      return;
    }
    state.busy = true;
    const checkedCounter = state.changeCounter;
    const checkedOrganization = state.organizationId;
    setStatus('syncing', '確認中', 'クラウドの最新版を確認しています');
    try{
      const remote = await fetchRemote();
      if(state.organizationId!==checkedOrganization || !state.session) return;
      const localRevision = getStoredRevision();
      state.revision = localRevision;
      const hasLocal = window.fermentCloudData.hasLocalData();
      // 旧版からの移行時は未送信か判定できないため、安全側で端末版を保持する。
      if(localStorage.getItem(pendingKey)===null && hasLocal) markPending();

      if(Number(remote.revision) === 0 && hasLocal){
        state.busy = false;
        await saveNow({manual:false});
        return;
      }
      if(Number(remote.revision) > localRevision){
        if(hasPendingChanges() || checkedCounter!==state.changeCounter){
          state.conflict = true;
          setStatus('error', '選択が必要', 'この端末とクラウドの両方にデータがあります', '「今すぐ同期」を押し、クラウド版とこの端末版のどちらを残すか確認してください。');
          return;
        }
        await applyRemote(remote);
      }else{
        if(Number(remote.revision)<localRevision){
          state.conflict = true;
          setStatus('error', '選択が必要', 'クラウドの更新番号が以前より古くなっています', '自動上書きを停止しました。バックアップとクラウドの状態を確認してください。');
          return;
        }
        setStoredRevision(remote.revision);
        if(hasPendingChanges()){
          state.busy = false;
          await saveNow({manual:false});
          return;
        }
      }
      setStatus('connected', '同期済み', '端末内・クラウドへ保存済み', `クラウド同期は正常です。更新番号 ${state.revision}`);
    }catch(error){
      console.error('cloud reconcile error', error);
      setStatus('error', '接続エラー', '端末内への保存を継続しています', 'クラウドへ接続できませんでした。端末内のデータは失われません。');
    }finally{
      state.busy = false;
    }
  }

  async function handleSession(session){
    const sameUser = state.session?.user?.id && state.session.user.id===session?.user?.id;
    state.session = session || null;
    if(sameUser && state.organizationId) return;
    clearTimeout(state.saveTimer);
    state.conflict = false;
    refreshControls();
    if(!state.session){
      state.organizationId = '';
      state.revision = 0;
      setStatus('', '未接続', '端末内へ保存しています', 'メールアドレスを入力し、ログインリンクを送ってください。');
      return;
    }
    setStatus('syncing', '接続中', 'アカウントを確認しています');
    try{
      await ensureOrganization();
      await reconcile();
    }catch(error){
      console.error('cloud session setup error', error);
      setStatus('error', '設定エラー', '端末内への保存を継続しています', 'クラウド側の初期設定を確認してください。端末内のデータは失われません。');
    }
  }

  async function initialize(){
    if(!state.enabled){
      configureUnavailableUi();
      return;
    }
    if(!window.supabase || !window.supabase.createClient){
      setStatus('error', '読込エラー', '端末内への保存を継続しています', '同期用ライブラリを読み込めませんでした。通信状況を確認してください。');
      refreshControls();
      return;
    }
    state.client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {persistSession:true, autoRefreshToken:true, detectSessionInUrl:true}
    });
    const {data} = await state.client.auth.getSession();
    await handleSession(data.session);
    state.client.auth.onAuthStateChange((_event, session)=>{
      setTimeout(()=>handleSession(session), 0);
    });
  }

  window.openCloudSyncDialog = function(){
    if(window.toggleDataMenu) window.toggleDataMenu(false);
    byId('cloudSyncBackdrop').hidden = false;
    byId('cloudSyncDialog').hidden = false;
    if(window.syncModalState) window.syncModalState();
    refreshControls();
    byId('cloudSyncDialog').querySelector('.help-close').focus();
  };

  window.closeCloudSyncDialog = function(){
    byId('cloudSyncBackdrop').hidden = true;
    byId('cloudSyncDialog').hidden = true;
    if(window.syncModalState) window.syncModalState();
  };

  window.requestCloudLogin = async function(){
    if(!state.enabled || !state.client){
      alert('クラウド接続先の準備後に利用できます。現在も端末内への保存は有効です。');
      return;
    }
    const email = (byId('cloudLoginEmail').value || '').trim();
    if(!email || !email.includes('@')){
      alert('メールアドレスを入力してください');
      return;
    }
    const redirectTo = `${location.origin}${location.pathname}`;
    const {error} = await state.client.auth.signInWithOtp({email, options:{emailRedirectTo:redirectTo}});
    if(error){
      alert('ログインメールを送信できませんでした。しばらくしてから再度お試しください。');
      return;
    }
    setStatus('syncing', 'メール送信済み', 'ログインメールを確認してください', `${email} へログインリンクを送りました。この端末でリンクを開いてください。`);
  };

  window.syncCloudNow = async function(){
    if(!state.session || state.busy || state.scopeMismatch) return;
    try{
      const remote = await fetchRemote();
      if(Number(remote.revision) !== state.revision){
        await resolveConflict();
      }else{
        await saveNow({manual:true});
      }
    }catch(error){
      console.error('manual sync error', error);
      setStatus('error', '接続エラー', '端末内への保存を継続しています');
    }
  };

  window.disconnectCloudSync = async function(){
    if(!state.client) return;
    if(!confirm('この端末のクラウド同期を解除しますか？\n端末内の記録は削除されません。')) return;
    await state.client.auth.signOut();
    await handleSession(null);
  };

  window.fermentCloudSync = {
    queueSave(){
      if(!state.enabled || state.applyingRemote) return;
      state.changeCounter++;
      markPending();
      if(!state.session || state.scopeMismatch || state.conflict) return;
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(()=>saveNow({manual:false}), 1200);
    }
  };

  window.addEventListener('online', ()=>{
    if(state.session) saveNow({manual:false});
  });
  window.addEventListener('load', initialize, {once:true});
})();
