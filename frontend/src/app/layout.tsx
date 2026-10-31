import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

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
    <html lang="fa" dir="rtl">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  );
}
