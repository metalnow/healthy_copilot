import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "健康副駕", template: "%s｜健康副駕" },
  description: "個人長期健康追蹤、行為分析與改善輔助工具（非醫療診斷系統）",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant-TW" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
