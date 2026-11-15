import type { ReactNode } from "react";
import type { EntryState, ExceptionStatus, FeedStatus, PeriodStatus } from "@/sample/finance";
import type { DocumentStatus, ExportStatus, MandateState } from "@/sample/finance-invoices";

// Lớp CSS của nhãn trạng thái ở màn "Kế toán", theo bảng trạng thái của bản thiết kế Finance: xanh =
// ổn, xanh dương = đang chạy, vàng = cần để ý, đỏ = bị chặn, xám = đã xong / lưu trữ.

export const ENTRY_BADGE: Record<EntryState, string> = {
  sealed: "badge b-ok",
  pending_seal: "badge b-info",
  reversed: "badge b-arch",
  reversal: "badge b-violet",
};

export const EXCEPTION_BADGE: Record<ExceptionStatus, string> = {
  open: "badge b-warn",
  resolved: "badge b-ok",
  ignored: "badge b-arch",
};

export const FEED_BADGE: Record<FeedStatus, string> = {
  active: "badge b-ok",
  paused: "badge b-warn",
  not_connected: "badge b-draft",
};

export const DOCUMENT_BADGE: Record<DocumentStatus, string> = {
  draft: "badge b-draft",
  issued: "badge b-info",
  submitting: "badge b-info",
  accepted: "badge b-ok",
  rejected: "badge b-bad",
  cancelled: "badge b-arch",
  replaced: "badge b-arch",
  adjusted: "badge b-sched",
};

export const SERIES_BADGE = { active: "badge b-ok", inactive: "badge b-arch" } as const;

export const MANDATE_BADGE: Record<MandateState, string> = {
  valid: "badge b-ok",
  scheduled: "badge b-sched",
  expired: "badge b-arch",
  revoked: "badge b-arch",
};

export const PERIOD_BADGE: Record<PeriodStatus, string> = {
  open: "badge b-info",
  closed: "badge b-arch",
};

export const EXPORT_BADGE: Record<ExportStatus, string> = {
  queued: "badge b-draft",
  running: "badge b-info",
  ready: "badge b-ok",
  failed: "badge b-bad",
};

/** Nhãn trạng thái có chấm màu, như mọi bảng của khung. */
export function StatusBadge({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className={className}>
      <span className="dot" />
      {children}
    </span>
  );
}
