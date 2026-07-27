"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";

// ---------------------------------------------------------------------------
// Shapes are stored in the base image's NATURAL pixel coordinates so they
// stay valid at any display size and composite 1:1 at full resolution.
// ---------------------------------------------------------------------------

type Tool = "rect" | "arrow" | "pen" | "text";

type Shape =
  | { type: "rect"; x: number; y: number; w: number; h: number; color: string }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { type: "pen"; points: Array<{ x: number; y: number }>; color: string }
  | { type: "text"; x: number; y: number; text: string; color: string };

export interface ReferenceAnnotations {
  baseUrl: string;
  width: number;
  height: number;
  shapes: Shape[];
}

interface EditorImage {
  id: string;
  blob_url: string;
  captured_at: string;
}

interface Props {
  cameraId: string;
  images: EditorImage[];
  annotations: ReferenceAnnotations | null;
  onClose: () => void;
  onSaved: () => void;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ffffff", "#000000"];
const MAX_DISPLAY_W = 760;

function lineWidthFor(naturalW: number): number {
  return Math.max(3, Math.round(naturalW / 300));
}
function fontSizeFor(naturalW: number): number {
  return Math.max(16, Math.round(naturalW / 38));
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
  scale: number,
  naturalW: number,
) {
  const lw = lineWidthFor(naturalW) * scale;
  ctx.strokeStyle = shape.color;
  ctx.fillStyle = shape.color;
  ctx.lineWidth = lw;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (shape.type === "rect") {
    ctx.strokeRect(shape.x * scale, shape.y * scale, shape.w * scale, shape.h * scale);
  } else if (shape.type === "arrow") {
    const x1 = shape.x1 * scale;
    const y1 = shape.y1 * scale;
    const x2 = shape.x2 * scale;
    const y2 = shape.y2 * scale;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = Math.max(10, lw * 4);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  } else if (shape.type === "pen") {
    if (shape.points.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(shape.points[0].x * scale, shape.points[0].y * scale);
    for (const p of shape.points.slice(1)) ctx.lineTo(p.x * scale, p.y * scale);
    ctx.stroke();
  } else {
    const fs = fontSizeFor(naturalW) * scale;
    ctx.font = `bold ${fs}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textBaseline = "top";
    // Halo for legibility against busy backgrounds.
    ctx.lineWidth = Math.max(2, fs / 6);
    ctx.strokeStyle = shape.color === "#000000" ? "#ffffff" : "#000000";
    ctx.strokeText(shape.text, shape.x * scale, shape.y * scale);
    ctx.fillStyle = shape.color;
    ctx.fillText(shape.text, shape.x * scale, shape.y * scale);
  }
}

export default function ReferenceEditor({ cameraId, images, annotations, onClose, onSaved }: Props) {
  const initialBase = annotations?.baseUrl ?? images[0]?.blob_url ?? null;
  const [baseUrl, setBaseUrl] = useState<string | null>(initialBase);
  const [shapes, setShapes] = useState<Shape[]>(annotations?.shapes ?? []);
  const [tool, setTool] = useState<Tool>("rect");
  const [color, setColor] = useState<string>(COLORS[0]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [dims, setDims] = useState<{ naturalW: number; naturalH: number; displayW: number; displayH: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const drawingRef = useRef(false);

  // Load / reload the base image whenever the chosen frame changes.
  useEffect(() => {
    if (!baseUrl) return;
    let cancelled = false;
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      imgRef.current = img;
      const naturalW = img.naturalWidth;
      const naturalH = img.naturalHeight;
      const displayW = Math.min(MAX_DISPLAY_W, naturalW);
      const displayH = Math.round((displayW * naturalH) / naturalW);
      setDims({ naturalW, naturalH, displayW, displayH });
    };
    img.onerror = () => {
      if (!cancelled) setError("Could not load the base image");
    };
    img.src = baseUrl;
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const redraw = useCallback(
    (extra: Shape | null) => {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      if (!canvas || !img || !dims) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const scale = dims.displayW / dims.naturalW;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, dims.displayW, dims.displayH);
      for (const s of shapes) drawShape(ctx, s, scale, dims.naturalW);
      if (extra) drawShape(ctx, extra, scale, dims.naturalW);
    },
    [shapes, dims],
  );

  useEffect(() => {
    redraw(draft);
  }, [redraw, draft, dims]);

  function toNatural(e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const dy = (e.clientY - rect.top) * (canvas.height / rect.height);
    const scale = dims!.displayW / dims!.naturalW;
    return { x: dx / scale, y: dy / scale };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dims) return;
    const p = toNatural(e);
    if (tool === "text") {
      const text = window.prompt("Label text");
      if (text && text.trim()) {
        setShapes((s) => [...s, { type: "text", x: p.x, y: p.y, text: text.trim(), color }]);
      }
      return;
    }
    drawingRef.current = true;
    canvasRef.current?.setPointerCapture(e.pointerId);
    if (tool === "rect") setDraft({ type: "rect", x: p.x, y: p.y, w: 0, h: 0, color });
    else if (tool === "arrow") setDraft({ type: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color });
    else setDraft({ type: "pen", points: [p], color });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !draft) return;
    const p = toNatural(e);
    if (draft.type === "rect") setDraft({ ...draft, w: p.x - draft.x, h: p.y - draft.y });
    else if (draft.type === "arrow") setDraft({ ...draft, x2: p.x, y2: p.y });
    else if (draft.type === "pen") setDraft({ ...draft, points: [...draft.points, p] });
  }

  function onPointerUp() {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (draft) {
      const keep =
        draft.type === "rect"
          ? Math.abs(draft.w) > 3 && Math.abs(draft.h) > 3
          : draft.type === "arrow"
            ? Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 5
            : draft.type === "pen"
              ? draft.points.length > 1
              : true;
      if (keep) {
        // Normalize a rect drawn in any direction to positive w/h.
        const committed: Shape =
          draft.type === "rect"
            ? {
                type: "rect",
                x: Math.min(draft.x, draft.x + draft.w),
                y: Math.min(draft.y, draft.y + draft.h),
                w: Math.abs(draft.w),
                h: Math.abs(draft.h),
                color: draft.color,
              }
            : draft;
        setShapes((s) => [...s, committed]);
      }
    }
    setDraft(null);
  }

  function undo() {
    setShapes((s) => s.slice(0, -1));
  }
  function clearAll() {
    setShapes([]);
  }

  async function save() {
    const img = imgRef.current;
    if (!img || !dims || !baseUrl) return;
    setSaving(true);
    setError(null);
    try {
      const off = document.createElement("canvas");
      off.width = dims.naturalW;
      off.height = dims.naturalH;
      const octx = off.getContext("2d");
      if (!octx) throw new Error("Canvas not supported");
      octx.drawImage(img, 0, 0, dims.naturalW, dims.naturalH);
      for (const s of shapes) drawShape(octx, s, 1, dims.naturalW);

      const blob: Blob | null = await new Promise((resolve) => off.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Failed to render reference image (image may be cross-origin blocked)");

      const payload: ReferenceAnnotations = {
        baseUrl,
        width: dims.naturalW,
        height: dims.naturalH,
        shapes,
      };
      const form = new FormData();
      form.append("image", blob, "reference.png");
      form.append("annotations", JSON.stringify(payload));

      const res = await fetch(`/api/admin/cameras/${cameraId}/reference`, {
        method: "PUT",
        body: form,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Save failed");
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-4xl rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Annotate reference image
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <p className="mt-1 text-xs text-zinc-500">
          Draw boxes, arrows, or labels over the scale so the vision reader knows exactly where to
          read. The camera view is fixed, so these marks line up with every future photo.
        </p>

        {images.length === 0 ? (
          <p className="mt-4 text-sm text-zinc-500">
            No photos yet — sync the camera first so there&apos;s a frame to annotate.
          </p>
        ) : (
          <>
            {/* Base frame picker */}
            <div className="mt-4">
              <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Base frame</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {images.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setBaseUrl(img.blob_url)}
                    className={`relative h-14 w-20 shrink-0 overflow-hidden rounded border-2 ${
                      baseUrl === img.blob_url
                        ? "border-blue-500"
                        : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
                    }`}
                    title={new Date(img.captured_at).toLocaleString()}
                  >
                    <Image src={img.blob_url} alt="" fill unoptimized sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* Toolbar */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {(["rect", "arrow", "pen", "text"] as Tool[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTool(t)}
                  className={`rounded px-2.5 py-1 text-xs font-medium capitalize ${
                    tool === t
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "border border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }`}
                >
                  {t === "rect" ? "box" : t}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-6 w-6 rounded-full border ${
                    color === c ? "ring-2 ring-offset-1 ring-blue-500 dark:ring-offset-zinc-900" : "border-zinc-300 dark:border-zinc-600"
                  }`}
                  style={{ backgroundColor: c }}
                  aria-label={`color ${c}`}
                />
              ))}
              <span className="mx-1 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
              <button
                onClick={undo}
                disabled={shapes.length === 0}
                className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Undo
              </button>
              <button
                onClick={clearAll}
                disabled={shapes.length === 0}
                className="rounded border border-zinc-300 px-2.5 py-1 text-xs text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Clear
              </button>
            </div>

            {/* Canvas */}
            <div className="mt-3 flex justify-center rounded-lg bg-zinc-100 p-2 dark:bg-zinc-950">
              {dims ? (
                <canvas
                  ref={canvasRef}
                  width={dims.displayW}
                  height={dims.displayH}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  className="max-w-full touch-none rounded"
                  style={{ cursor: "crosshair" }}
                />
              ) : (
                <div className="h-64 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
              )}
            </div>

            {error && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}

            <div className="mt-4 flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving || !dims}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {saving ? "Saving..." : "Save reference"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
