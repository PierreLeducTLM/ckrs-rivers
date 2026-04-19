"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableRiverProps {
  id: string;
  t: (key: string) => string;
  children: (handle: ReactNode) => ReactNode;
}

export default function SortableRiver({ id, t, children }: SortableRiverProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.85 : 1,
  };

  const handle = (
    <button
      {...attributes}
      {...listeners}
      aria-label={t("myRivers.reorderHandle")}
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="cursor-grab touch-none rounded p-0.5 text-foreground/30 transition-colors hover:text-foreground/60 active:cursor-grabbing"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <circle cx="9" cy="6" r="1.6" />
        <circle cx="15" cy="6" r="1.6" />
        <circle cx="9" cy="12" r="1.6" />
        <circle cx="15" cy="12" r="1.6" />
        <circle cx="9" cy="18" r="1.6" />
        <circle cx="15" cy="18" r="1.6" />
      </svg>
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(handle)}
    </div>
  );
}
