import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { APP_HOST, getAppStoreUrl, getPlayStoreUrl } from "@/lib/ddl/config";

const SITE_URL = `https://${APP_HOST}`;
const OG_IMAGE = `${SITE_URL}/og/download.png`;

export const metadata: Metadata = {
  title: "FlowCast — Téléchargez l'application",
  description: "Prévisions de débit pour kayakistes. Disponible sur iOS, Android et le web.",
  openGraph: {
    title: "FlowCast",
    description: "Prévisions de débit pour kayakistes. Disponible sur iOS, Android et le web.",
    url: `${SITE_URL}/download`,
    siteName: "FlowCast",
    type: "website",
    images: [
      {
        url: OG_IMAGE,
        width: 1080,
        height: 540,
        alt: "FlowCast — disponible sur l'App Store, Google Play et le web",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FlowCast",
    description: "Prévisions de débit pour kayakistes.",
    images: [OG_IMAGE],
  },
};

function isMessengerOrSocialBot(ua: string): boolean {
  return /facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|WhatsApp|TelegramBot|Discordbot|Pinterest/i.test(
    ua,
  );
}

export default async function DownloadPage() {
  const ua = (await headers()).get("user-agent") ?? "";

  if (!isMessengerOrSocialBot(ua)) {
    if (/iPhone|iPad|iPod/i.test(ua)) redirect(getAppStoreUrl());
    if (/Android/i.test(ua)) redirect(getPlayStoreUrl("messenger-share"));
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0b3a82] via-[#1e6fd9] to-[#0fb5d6] flex items-center justify-center px-6 py-12">
      <div className="max-w-3xl w-full text-center text-white">
        <Image
          src="/logo2.png"
          alt="FlowCast"
          width={180}
          height={180}
          priority
          className="mx-auto mb-8 drop-shadow-xl"
        />

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-4">FlowCast</h1>
        <p className="text-xl sm:text-2xl text-blue-50/95 mb-3">
          Prévisions de débit pour kayakistes
        </p>
        <p className="text-base sm:text-lg text-blue-100/85 mb-12 max-w-xl mx-auto">
          Suivez les niveaux d&apos;eau en temps réel sur vos rivières favorites.
        </p>

        <p className="text-sm uppercase tracking-widest text-blue-100/70 mb-6">Disponible sur</p>

        <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-center justify-center">
          <a
            href={getAppStoreUrl()}
            className="transition-transform hover:scale-105 focus:scale-105 outline-none"
            aria-label="Télécharger sur l'App Store"
          >
            <Image
              src="/marketing-badges/app-store.svg"
              alt="Télécharger sur l'App Store"
              width={180}
              height={60}
              priority
            />
          </a>

          <a
            href={getPlayStoreUrl("download-page")}
            className="transition-transform hover:scale-105 focus:scale-105 outline-none"
            aria-label="Disponible sur Google Play"
          >
            <Image
              src="/marketing-badges/google-play.png"
              alt="Disponible sur Google Play"
              width={190}
              height={60}
              priority
            />
          </a>

          <Link
            href="/"
            className="transition-transform hover:scale-105 focus:scale-105 outline-none"
            aria-label="Accéder via le web"
          >
            <Image
              src="/marketing-badges/web.png"
              alt="Accéder via le web"
              width={190}
              height={60}
              priority
            />
          </Link>
        </div>
      </div>
    </main>
  );
}
