import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "雅局掼蛋｜四人两副牌单机对战",
  description: "遵循竞技掼蛋规则的单人网页游戏，与三名 AI 从 2 打到 A。",
  applicationName: "雅局掼蛋",
  keywords: ["掼蛋", "双副牌", "棋牌游戏", "单机游戏", "AI对战"],
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  openGraph: {
    title: "雅局掼蛋",
    description: "四人结对、两副牌 108 张，与三名 AI 从 2 打到 A。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og-guandan.png",
        width: 1792,
        height: 1024,
        alt: "雅局掼蛋——四人结对、双副牌 108 张、AI 对战",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "雅局掼蛋",
    description: "四人结对 · 双副牌 108 张 · AI 对战",
    images: ["/og-guandan.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#071813",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
