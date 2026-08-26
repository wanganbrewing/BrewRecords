// Supabaseプロジェクト作成後に、Project URLとPublishable keyを設定します。
// Publishable keyはブラウザに置ける公開用キーです。Secret keyは絶対に記載しません。
window.FERMENTERS_LEDGER_CLOUD = {
  // デモモードは通常データと完全に分離し、クラウドへ同期しません。
  enabled: new URLSearchParams(location.search).get('demo') !== '1',
  supabaseUrl: 'https://ascjpigpxrwfzzuecebq.supabase.co',
  supabasePublishableKey: 'sb_publishable_6gD03xsl3R9S6qtlS9fnDw_2LYS5eGA'
};
