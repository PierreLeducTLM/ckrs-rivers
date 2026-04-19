"use client";

import type { CSSProperties, ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface SortableRiverProps {
  id: string;
  children: ReactNode;
  t: (key: string) => string;
}

export default function SortableRiver({ id, children, t }: SortableRiverProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-stretch gap-2"
    >
      <button
        {...attributes}
        {...listeners}
        aria-label={t("myRivers.reorderHandle")}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="flex w-7 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-foreground/30 transition-colors hover:bg-foreground/5 hover:text-foreground/60 active:cursor-grabbing"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
