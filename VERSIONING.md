# バージョン更新手順

公開ごとに整数のリリース番号を増やす（v55 → v56）。日付だけでは同日の更新を区別できないため番号を併記する。

1. version.jsonのversion、releasedAt、summaryを更新。
2. index.htmlのAPP_VERSION、appVersion（aria-label含む）、menuAppVersion、変更説明、スクリプトと埋め込みヘルプのvクエリを更新。
3. sw.jsのCACHE_NAMEとAPP_SHELLのvクエリを同じ番号に更新。
4. help.htmlのバージョン例を更新し、node --test tests/safety.test.cjsを実行。表示・キャッシュ・公開メタデータの番号不一致をテストで検出する。
5. claude-importのHTML・ヘルプ・SW・version.jsonへ同内容を反映。
6. 最新remote treeを基にまとめてコミット・公開する。GitHubのbuild成功だけでなく配信完了と公開ファイル一致を確認。

メニューを開くとversion.jsonをno-store・固有クエリで取得する。SWでもこのファイルをキャッシュしない。失敗・不正レスポンス・タイムアウトは「確認できません」と表示する。使用中の番号が公開版より大きい場合は配信切り替え中の可能性を表示する。

版の比較は確認時点の配信情報。未保存フォームを守るため、自動リロードやデータ消去はしない。通常版・デモ版とも使用中番号を保持する。
