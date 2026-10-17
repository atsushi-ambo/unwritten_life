import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "UNWRITTEN LIFE",
  description: "選択から次の人生を描く、あなただけの人生ゲーム。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
