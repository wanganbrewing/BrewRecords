# Supabase停止防止の設定

GitHub Actionsから1日3回、データを読み書きしない稼働確認をSupabaseへ送信します。

## 1. Supabase側

SupabaseのSQL Editorで `supabase-keepalive.sql` を一度だけ実行します。

## 2. GitHub側

追加設定は不要です。workflowは、アプリがブラウザーで使用している公開用の `supabase-config.js` からProject URLとPublishable keyを読み取ります。Secret keyやデータベースのパスワードは使用しません。

## 3. 動作確認

GitHubの `Actions` → `Supabase keepalive` → `Run workflow` を実行し、緑色の成功表示になることを確認します。

## 注意

公開リポジトリでは、リポジトリ自体に60日間活動がないとGitHubが定期workflowを自動停止します。開発を長期間休止する場合は、Actions画面でworkflowが有効か確認してください。商用運用ではSupabase Proへの移行を推奨します。
