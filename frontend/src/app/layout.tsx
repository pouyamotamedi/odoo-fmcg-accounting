import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic"],
  variable: "--font-vazirmatn",
});

export const metadata: Metadata = {
  title: "فروشگاه من - نرم‌افزار مدیریت فروشگاه",
  description: "سیستم مدیریت فروشگاه FMCG با حسابداری، انبارداری، و صندوق فروش",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-vazirmatn)]">
        {children}
      </body>
    </html>
  );
}
