export const metadata = {
  title: 'MedIntel',
  description: '医療市場インテリジェンス — Tier S/A/B 上位2,802施設 × 9因子スコアリング',
};
export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet"/>
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate"/>
        <meta httpEquiv="Pragma" content="no-cache"/>
        <meta httpEquiv="Expires" content="0"/>
      </head>
      <body style={{ margin: 0, fontFamily: "'DM Sans', system-ui, sans-serif" }}>{children}</body>
    </html>
  );
}
