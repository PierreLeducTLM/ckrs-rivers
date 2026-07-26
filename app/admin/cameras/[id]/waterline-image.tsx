import type { Waterline } from "@/lib/skypoint/read-level";

interface Props {
  src: string;
  waterline: Waterline | null;
  label?: string;
  alt?: string;
}

/**
 * Renders a camera photo at its natural aspect ratio with the AI-detected
 * water level drawn on top. Because the image sets the box size (width:100%,
 * height:auto), an SVG overlay with a 0..1 viewBox maps normalized coordinates
 * to pixels linearly — the line stays aligned at any container width.
 */
export default function WaterlineImage({ src, waterline, label, alt = "" }: Props) {
  const mx = waterline ? (waterline.x1 + waterline.x2) / 2 : 0;
  const my = waterline ? (waterline.y1 + waterline.y2) / 2 : 0;

  return (
    <div className="relative w-full bg-zinc-100 dark:bg-zinc-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block h-auto w-full" />

      {waterline && (
        <>
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
            aria-hidden
          >
            {/* Dark halo under a bright line for contrast on any background. */}
            <line
              x1={waterline.x1}
              y1={waterline.y1}
              x2={waterline.x2}
              y2={waterline.y2}
              stroke="rgba(0,0,0,0.7)"
              strokeWidth={6}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <line
              x1={waterline.x1}
              y1={waterline.y1}
              x2={waterline.x2}
              y2={waterline.y2}
              stroke="#fde047"
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {label && (
            <span
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-black/75 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-yellow-200"
              style={{ left: `${mx * 100}%`, top: `calc(${my * 100}% - 250px)` }}
            >
              {label}
            </span>
          )}
        </>
      )}
    </div>
  );
}
