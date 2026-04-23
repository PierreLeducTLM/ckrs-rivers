"use client";

import { useState, useRef, type ReactNode } from "react";
import Image from "next/image";
import { useTranslation } from "@/lib/i18n/provider";

interface OnboardingTourProps {
  onFinish: () => void;
}

const SLIDE_COUNT = 3;
const SWIPE_THRESHOLD = 40;

export default function OnboardingTour({ onFinish }: OnboardingTourProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const isLast = index === SLIDE_COUNT - 1;

  const goNext = () => {
    if (index < SLIDE_COUNT - 1) setIndex(index + 1);
    else onFinish();
  };
  const goBack = () => {
    if (index > 0) setIndex(index - 1);
  };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current == null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    if (delta < 0 && index < SLIDE_COUNT - 1) setIndex(index + 1);
    if (delta > 0 && index > 0) setIndex(index - 1);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t(`onboarding.slide${index + 1}.title`)}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="mx-4 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-foreground/10 bg-background shadow-2xl">
        <div className="flex items-center justify-end px-4 pt-3">
          <button
            onClick={onFinish}
            className="rounded-md px-2 py-1 text-xs font-medium text-foreground/50 transition-colors hover:text-brand"
          >
            {t("onboarding.skip")}
          </button>
        </div>

        <div
          className="relative overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            <Slide title={t("onboarding.slide1.title")} body={t("onboarding.slide1.body")}>
              <LogoHero />
            </Slide>
            <Slide title={t("onboarding.slide2.title")} body={t("onboarding.slide2.body")}>
              <ReadinessHero t={t} />
            </Slide>
            <Slide title={t("onboarding.slide3.title")} body={t("onboarding.slide3.body")}>
              <StarHero />
            </Slide>
          </div>
        </div>

        <div className="flex items-center justify-center gap-1.5 py-3">
          {Array.from({ length: SLIDE_COUNT }).map((_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-brand" : "w-1.5 bg-foreground/20"
              }`}
            />
          ))}
        </div>

        <div className="flex gap-2 px-4 pb-4 pt-1">
          {index > 0 ? (
            <button
              onClick={goBack}
              className="flex-1 rounded-lg bg-foreground/10 px-4 py-2.5 text-sm font-medium hover:bg-foreground/15"
            >
              {t("onboarding.back")}
            </button>
          ) : (
            <div className="flex-1" aria-hidden="true" />
          )}
          <button
            onClick={goNext}
            className="flex-1 rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {isLast ? t("onboarding.getStarted") : t("onboarding.next")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Slide({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children: ReactNode;
}) {
  return (
    <div className="w-full shrink-0 px-6 pb-2 pt-1">
      <div className="flex h-44 items-center justify-center">{children}</div>
      <h3 className="mt-2 text-center text-lg font-semibold">{title}</h3>
      <p className="mt-2 text-center text-sm leading-relaxed text-foreground/60">{body}</p>
    </div>
  );
}

function LogoHero() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute inset-x-6 bottom-6 h-20 rounded-full blur-2xl"
        style={{
          background:
            "linear-gradient(90deg, rgba(45,143,204,0.45), rgba(59,130,246,0.35), rgba(16,185,129,0.35))",
        }}
      />
      <div className="relative flex items-center gap-3">
        <Image
          src="/logo2.png"
          alt=""
          width={72}
          height={72}
          className="h-16 w-16 object-contain drop-shadow"
        />
      </div>
    </div>
  );
}

function ReadinessHero({
  t,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // Mock a river card tuned to "ideal" so the user sees the live styling.
  const idealColor = "#10b981";
  const markerPosition = 0.58;
  return (
    <div
      className="w-full rounded-xl border-2 bg-background p-3 shadow"
      style={{
        borderColor: idealColor,
        boxShadow: `0 0 12px ${idealColor}25`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold tabular-nums text-white"
          style={{ backgroundColor: idealColor }}
        >
          42
        </span>
        <span className="text-[11px] font-medium text-foreground/50">m&sup3;/s</span>
        <span
          className="ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#059669" }}
        >
          {t("status.ideal")}
        </span>
      </div>
      <div className="mt-3">
        <div
          className="relative h-2 w-full rounded-full"
          style={{
            background:
              "linear-gradient(to right, #4ADE80, #16A34A 50%, #16A34A 70%, #FACC15 80%, #D32F2F)",
          }}
        >
          <div
            className="absolute top-1/2 h-6 w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-sm bg-white ring-2 ring-black/80 shadow-[0_0_4px_rgba(0,0,0,0.5)] animate-flow-pulse dark:bg-zinc-900 dark:ring-white"
            style={{ left: `${markerPosition * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] font-medium tabular-nums text-foreground/50">
          <span>{t("onboarding.min")}</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {t("onboarding.ideal")}
          </span>
          <span>{t("onboarding.max")}</span>
        </div>
      </div>
    </div>
  );
}

function StarHero() {
  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <div
        aria-hidden="true"
        className="absolute h-24 w-24 rounded-full"
        style={{ background: "rgba(234,179,8,0.18)", filter: "blur(24px)" }}
      />
      <svg
        className="relative h-20 w-20 text-yellow-500 animate-flow-pulse"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    </div>
  );
}
