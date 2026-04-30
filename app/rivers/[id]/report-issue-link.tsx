"use client";

import { useState } from "react";
import { useTranslation } from "@/lib/i18n/provider";
import FeedbackModal from "@/app/feedback-modal";

interface ReportIssueLinkProps {
  stationId: string;
  stationName: string;
}

export default function ReportIssueLink({ stationId, stationName }: ReportIssueLinkProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs text-foreground/40 underline-offset-2 transition-colors hover:text-brand hover:underline"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        {t("feedback.reportIssue")}
      </button>
      {open && (
        <FeedbackModal
          stationId={stationId}
          stationName={stationName}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
