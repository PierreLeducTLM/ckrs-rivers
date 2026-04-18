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
    <div ref={setNodeRef} style={style} className="relative">
      <button
        {...attributes}
        {...listeners}
        aria-label={t("myRivers.reorderHandle")}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        className="absolute -left-1 top-1/2 z-20 -translate-y-1/2 cursor-grab touch-none rounded-md bg-background/90 p-1.5 text-foreground/40 shadow-sm ring-1 ring-foreground/10 backdrop-blur transition-colors hover:text-foreground/70 active:cursor-grabbing"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="6" r="1.6" />
          <circle cx="15" cy="6" r="1.6" />
          <circle cx="9" cy="12" r="1.6" />
          <circle cx="15" cy="12" r="1.6" />
          <circle cx="9" cy="18" r="1.6" />
          <circle cx="15" cy="18" r="1.6" />
        </svg>
      </button>
      {children}
    </div>
  );
}
