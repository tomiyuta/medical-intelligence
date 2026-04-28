export const metadata = {
  title: 'MedIntel — 日本の医療と高齢社会',
  description: '厚労省・総務省・社人研オープンデータによる医療インフラ・人口動態・病院機能の俯瞰分析',
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
