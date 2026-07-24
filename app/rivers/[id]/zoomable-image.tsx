"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

interface ZoomableImageProps {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
}

/**
 * Renders an image that opens a full-screen zoom overlay (lightbox) when
 * clicked. The overlay can be dismissed with the Escape key, by clicking the
 * backdrop, or via the close button.
 */
export default function ZoomableImage({ src, alt, sizes, className }: ZoomableImageProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKeyDown);

    // Prevent the page behind the overlay from scrolling.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Zoom photo"
        className="group absolute inset-0 h-full w-full cursor-zoom-in"
      >
        <Image src={src} alt={alt} fill unoptimized sizes={sizes} className={className} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full max-w-full cursor-zoom-out items-center justify-center"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={close}
            />
          </div>
        </div>
      )}
    </>
  );
}
