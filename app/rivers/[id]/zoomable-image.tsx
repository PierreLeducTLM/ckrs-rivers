"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface ZoomableImageProps {
  src: string;
  alt: string;
  sizes?: string;
  className?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;

/**
 * Renders an image that opens a full-screen zoom overlay (lightbox) when
 * clicked. Inside the overlay the image itself can be zoomed (wheel, pinch,
 * double-click, or the +/- buttons) and panned, while the close button and
 * controls stay fixed in place at a constant size. The overlay is rendered in
 * a portal on document.body so it sits above map widgets and other stacking
 * contexts, and is dismissed with Escape, the backdrop, or the close button.
 */
export default function ZoomableImage({ src, alt, sizes, className }: ZoomableImageProps) {
  const [open, setOpen] = useState(false);

  // Zoom / pan state for the image inside the overlay.
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; scale: number } | null>(null);
  const panStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const reset = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    reset();
  }, [reset]);

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

  const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomBy = useCallback((factor: number) => {
    setScale((s) => {
      const next = clampScale(s * factor);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    setScale((s) => {
      const next = clampScale(s * factor);
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const onDoubleClick = useCallback(() => {
    setScale((s) => {
      const next = s > 1 ? 1 : 2.5;
      if (next === 1) setOffset({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size === 2) {
        const [p1, p2] = [...pointers.current.values()];
        pinchStart.current = { dist: distance(p1, p2), scale };
        panStart.current = null;
      } else if (pointers.current.size === 1 && scale > 1) {
        panStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      }
    },
    [scale, offset],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && pinchStart.current) {
      const [p1, p2] = [...pointers.current.values()];
      const ratio = distance(p1, p2) / pinchStart.current.dist;
      const next = clampScale(pinchStart.current.scale * ratio);
      setScale(next);
      if (next === 1) setOffset({ x: 0, y: 0 });
    } else if (pointers.current.size === 1 && panStart.current) {
      setOffset({
        x: panStart.current.ox + (e.clientX - panStart.current.x),
        y: panStart.current.oy + (e.clientY - panStart.current.y),
      });
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
    if (pointers.current.size === 0) panStart.current = null;
  }, []);

  const overlay = open ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={close}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-sm"
    >
      {/* Fixed controls — outside the transformed image, so they never scale. */}
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="fixed right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="fixed bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(1 / 1.4);
          }}
          aria-label="Zoom out"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
          disabled={scale <= MIN_SCALE}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          aria-label="Reset zoom"
          className="rounded-full bg-white/10 px-3 py-2 text-xs font-medium tabular-nums text-white transition-colors hover:bg-white/20"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            zoomBy(1.4);
          }}
          aria-label="Zoom in"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 disabled:opacity-40"
          disabled={scale >= MAX_SCALE}
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Zoom stage — touch-none lets us handle gestures instead of the browser. */}
      <div
        className="flex h-full w-full touch-none items-center justify-center overflow-hidden p-4"
        onClick={(e) => e.stopPropagation()}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            cursor: scale > 1 ? "grab" : "zoom-in",
          }}
          className="max-h-[90vh] max-w-[90vw] select-none object-contain transition-transform duration-75 will-change-transform"
        />
      </div>
    </div>
  ) : null;

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

      {overlay && typeof document !== "undefined"
        ? createPortal(overlay, document.body)
        : null}
    </>
  );
}
