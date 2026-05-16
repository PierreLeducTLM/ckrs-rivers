"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

interface ZoomablePhotoProps {
  src: string;
  alt: string;
}

export default function ZoomablePhoto({ src, alt }: ZoomablePhotoProps) {
  const [open, setOpen] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  function close() {
    setOpen(false);
    setZoomed(false);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Zoom photo"
        className="relative block aspect-[4/3] w-full cursor-zoom-in bg-zinc-100 dark:bg-zinc-950"
      >
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div
            className={`flex h-full w-full items-center justify-center ${zoomed ? "overflow-auto" : "overflow-hidden"}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              aria-label={zoomed ? "Zoom out" : "Zoom in"}
              className={`relative shrink-0 transition-transform duration-200 ${
                zoomed
                  ? "h-[200vh] w-[200vw] max-w-none cursor-zoom-out"
                  : "h-full w-full cursor-zoom-in"
              }`}
            >
              <Image
                src={src}
                alt={alt}
                fill
                unoptimized
                sizes="100vw"
                className="object-contain"
                priority
              />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
