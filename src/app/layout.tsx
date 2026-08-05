import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roam 路线图",
  description: "旅行路线规划工具：自动规划、自由绘制、多日行程、分享给朋友",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
