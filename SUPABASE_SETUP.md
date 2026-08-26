# Fermenter's Ledger クラウド同期設定

## 1. Supabaseプロジェクトを作成

Supabase Dashboardで新しいプロジェクトを作成します。開発用と商用本番用は別プロジェクトにします。

## 2. データベースを作成

Supabase DashboardのSQL Editorを開き、`supabase-schema.sql` の内容を実行します。

このSQLは以下を作成します。

- 事業者
- 利用者と権限
- アプリデータ
- 同期履歴
- 利用者ごとのアクセス制限
- 同時更新の競合検知

## 3. ログインURLを許可

AuthenticationのURL設定で以下を登録します。

- Site URL: `https://moto1092.github.io/BrewRecords/`
- Redirect URL: `https://moto1092.github.io/BrewRecords/`
- 開発時のみ: `http://127.0.0.1:8774/claude-import-2026-08-26/wangan_brew_log_latest.html`

## 4. 公開用接続情報を設定

Project SettingsからProject URLとPublishable keyを確認し、`supabase-config.js` を更新します。

```js
window.FERMENTERS_LEDGER_CLOUD = {
  enabled: true,
  supabaseUrl: 'https://PROJECT.supabase.co',
  supabasePublishableKey: 'sb_publishable_...'
};
```

Publishable keyは行レベルセキュリティと組み合わせてブラウザで使う公開用キーです。Secret keyまたはservice_role keyはHTMLやJavaScriptへ記載しません。

## 5. 動作確認

1. PCでクラウド同期を開く
2. メールアドレスを入力する
3. 届いたログインリンクをPCで開く
4. 記録を保存し「同期済み」を確認する
5. iPhoneで同じメールアドレスを使ってログインする
6. PCの記録がiPhoneへ表示されることを確認する
7. オフライン保存と再接続後の同期を確認する

## 商用公開前

- Supabase Proへ移行する
- 開発用と本番用のプロジェクトを分離する
- 独自ドメインを設定する
- 利用規約とプライバシーポリシーを用意する
- バックアップ復元テストを行う
- 事業者招待・役割変更画面を追加する
