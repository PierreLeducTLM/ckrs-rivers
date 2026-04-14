import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ThemeInit from "./theme-init";
import CapacitorInit from "./capacitor-init";
import { I18nProvider } from "@/lib/i18n/provider";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "FlowCast — River flow forecasts",
  description: "River flow forecasts for paddlers",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FlowCast",
  },
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
        <ThemeInit />
        <I18nProvider>
          <Analytics/>
          <CapacitorInit />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
