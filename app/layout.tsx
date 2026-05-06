import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CapacitorInit from "./capacitor-init";
import { I18nProvider } from "@/lib/i18n/provider";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"
import { SpeedInsights } from '@vercel/speed-insights/next';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// apple-itunes-app smart banner. Lets mobile Safari surface "Open in app" /
// "View on App Store" without us writing any banner UI. Only renders inside
// Safari, but it's a free win for users who tap "⋯ → Open in Safari" out of
// Messenger's in-app browser.
const IOS_APP_STORE_ID = process.env.NEXT_PUBLIC_IOS_APP_STORE_ID;
const otherMeta: Record<string, string> = {};
if (IOS_APP_STORE_ID) {
  otherMeta["apple-itunes-app"] = `app-id=${IOS_APP_STORE_ID}`;
}

export const metadata: Metadata = {
  title: "FlowCast — River flow forecasts",
  description: "River flow forecasts for paddlers",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlowCast",
  },
  other: otherMeta,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <I18nProvider>
          <Analytics/>
          <SpeedInsights />
          <CapacitorInit />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
