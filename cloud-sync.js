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
    enabled: Boolean(config.enabled && config.supabaseUrl && config.supabasePublishableKey)
  };

  const byId = id => document.getElementById(id);
  const deviceId = getOrCreateDeviceId();

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
    setStatus('', '準備中', '端末内へ保存しています', 'クラウド同期の接続先はまだ設定されていません。現在も端末内への保存は通常どおり利用できます。');
    refreshControls();
  }

  async function ensureOrganization(){
    const {data, error} = await state.client.rpc('create_personal_organization', {
      organization_name: '個人ワークスペース'
    });
    if(error) throw error;
    state.organizationId = data;
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
    return Boolean(payload && ((Array.isArray(payload.batches) && payload.batches.length) || (Array.isArray(payload.inventory) && payload.inventory.length)));
  }

  async function applyRemote(remote){
    state.applyingRemote = true;
    try{
      await window.fermentCloudData.applySnapshot(remote.payload || {schemaVersion:1, batches:[], inventory:[]});
      setStoredRevision(remote.revision);
    }finally{
      state.applyingRemote = false;
    }
  }

  async function saveNow(options){
    const manual = Boolean(options && options.manual);
    if(!state.enabled || !state.session || state.applyingRemote || state.busy) return;
    if(!navigator.onLine){
      setStatus('syncing', '同期待ち', 'オフライン：端末内へ保存済み', '通信が戻ったときにクラウドへ自動保存します。');
      return;
    }

    state.busy = true;
    setStatus('syncing', '同期中', 'クラウドへ保存しています', '端末内への保存は完了しています。クラウドへ送信中です。');
    try{
      const snapshot = window.fermentCloudData.getSnapshot();
      const {data, error} = await state.client.rpc('save_app_snapshot', {
        target_organization_id: state.organizationId,
        snapshot_payload: snapshot,
        expected_revision: state.revision,
        source_device_id: deviceId
      });
      if(error) throw error;
      setStoredRevision(data);
      setStatus('connected', '同期済み', '端末内・クラウドへ保存済み', `クラウド同期は正常です。更新番号 ${state.revision}`);
    }catch(error){
      const conflict = String(error && (error.message || error.details || error)).includes('sync_conflict');
      if(conflict){
        setStatus('error', '競合あり', '別の端末で新しい変更があります', '安全のため自動上書きを止めました。「今すぐ同期」を押して最新版を確認してください。');
        if(manual) await resolveConflict();
      }else{
        console.error('cloud save error', error);
        setStatus('error', '再試行待ち', '端末内へ保存済み・クラウド保存待ち', 'クラウドへの保存に失敗しました。通信回復後に再試行します。');
      }
    }finally{
      state.busy = false;
    }
  }

  async function resolveConflict(){
    const remote = await fetchRemote();
    const useRemote = confirm('別の端末に新しい変更があります。\n\nOK：クラウドの最新版をこの端末へ取り込む\nキャンセル：この端末のデータを残す');
    if(useRemote){
      await applyRemote(remote);
      setStatus('connected', '同期済み', 'クラウドの最新版を取り込みました', `クラウド同期は正常です。更新番号 ${state.revision}`);
    }
  }

  async function reconcile(){
    if(!state.session || !state.organizationId) return;
    state.busy = true;
    setStatus('syncing', '確認中', 'クラウドの最新版を確認しています');
    try{
      const remote = await fetchRemote();
      const localRevision = getStoredRevision();
      state.revision = localRevision;
      const hasLocal = window.fermentCloudData.hasLocalData();
      const hasRemote = remoteHasData(remote);

      if(Number(remote.revision) === 0 && hasLocal){
        state.busy = false;
        await saveNow({manual:false});
        return;
      }
      if(Number(remote.revision) > localRevision){
        if(localRevision === 0 && hasLocal && hasRemote){
          setStatus('error', '確認必要', '端末とクラウドの両方にデータがあります', '「今すぐ同期」を押し、どちらを使用するか確認してください。');
          return;
        }
        await applyRemote(remote);
      }else{
        setStoredRevision(remote.revision);
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
    state.session = session || null;
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
    if(!state.session) return;
    try{
      const remote = await fetchRemote();
      if(Number(remote.revision) > state.revision){
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
      if(!state.enabled || !state.session || state.applyingRemote) return;
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(()=>saveNow({manual:false}), 1200);
    }
  };

  window.addEventListener('online', ()=>{
    if(state.session) saveNow({manual:false});
  });
  window.addEventListener('load', initialize, {once:true});
})();
