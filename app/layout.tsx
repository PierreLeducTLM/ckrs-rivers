import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import CapacitorInit from "./capacitor-init";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Kayak Rivière aux Sables — Prévisions de débit",
  description: "Prévisions de débit des rivières pour les pagayeurs",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KRAS",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
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
        <CapacitorInit />
        {children}
      </body>
    </html>
  );
}
