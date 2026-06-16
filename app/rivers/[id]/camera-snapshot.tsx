import {
  runnabilityColors,
  runnabilityFor,
  runnabilityLabel,
} from "@/lib/skypoint/runnability";
import ZoomablePhoto from "./zoomable-photo";

export interface CameraSnapshotData {
  imageUrl: string;
  capturedAt: string;
  readingValue: number | null;
  readingConfidence: string | null;
  scaleUnit: string | null;
  paddlingMinReading: number | null;
  paddlingIdealReading: number | null;
  paddlingMaxReading: number | null;
}

export default function CameraSnapshot({ data }: { data: CameraSnapshotData }) {
  const status = runnabilityFor(data.readingValue, {
    paddlingMinReading: data.paddlingMinReading,
    paddlingIdealReading: data.paddlingIdealReading,
    paddlingMaxReading: data.paddlingMaxReading,
  });
  const colors = runnabilityColors[status];

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="px-5 pt-5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        Camera
      </h2>
      <div className="mt-3">
        <ZoomablePhoto src={data.imageUrl} alt="Latest river camera photo" />
      </div>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-5">
        {data.readingValue != null && (
          <>
            <span className="text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {data.readingValue.toFixed(2)}
            </span>
            {data.scaleUnit && (
              <span className="text-base text-zinc-500 dark:text-zinc-400">{data.scaleUnit}</span>
            )}
          </>
        )}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${colors.bg} ${colors.text}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
          {runnabilityLabel(status)}
        </span>
        <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400">
          {new Date(data.capturedAt).toLocaleString()}
        </span>
      </div>
    </section>
  );
}
