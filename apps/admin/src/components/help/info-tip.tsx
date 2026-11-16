"use client";

// Nút ⓘ cạnh tiêu đề mục (toggletip, thiết kế mục 6): bấm hay chạm mới mở, không mở khi rê chuột, nên
// dùng được trên điện thoại và chứa được nút. Hộp gồm tiêu đề, giải thích (tối đa ba câu), ví dụ nếu có,
// "Tìm hiểu thêm" (mở bảng Trợ giúp của trang) và "Đã hiểu" (chỉ hiện trên điện thoại, nơi hộp là tấm
// trượt từ đáy). Không bao giờ để thông tin bắt buộc, lỗi hay cảnh báo chỉ nằm trong hộp này.
//
// Popover của HTML lo việc đóng (Esc, bấm ra ngoài); CSS anchor positioning đặt hộp cạnh nút.
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Icon } from "@/components/shell/icon";
import { HELP_ID } from "@/help/pages";

/** Các hộp giải thích; chữ ở `help.tips.<id>` (`label`, `title`, `body`, tuỳ chọn `example`). */
export type TipId =
  | "tasks"
  | "setup"
  | "saved_views"
  | "required_pages"
  | "websites"
  | "depth"
  | "inherit"
  | "incident"
  | "data_requests"
  | "plans"
  | "placement"
  | "deliveries"
  | "idempotency"
  | "agent_keys";

export function InfoTip({ id }: { id: TipId }) {
  const t = useTranslations("help");
  const popover = `tip-${id}`;
  const anchor = `--tip-${id}`;
  const label = t(`tips.${id}.label`);
  const example = t.has(`tips.${id}.example`) ? t(`tips.${id}.example`) : null;
  const moreHelp = () => {
    document.getElementById(popover)?.hidePopover();
    document.getElementById(HELP_ID)?.showPopover();
  };
  return (
    <>
      <button
        type="button"
        className="qi"
        popoverTarget={popover}
        aria-label={t("tip.open", { name: label })}
        style={{ anchorName: anchor }}
      >
        <Icon name="info" small />
      </button>
      <span
        className="tip"
        id={popover}
        popover="auto"
        role="dialog"
        aria-label={label}
        style={{ positionAnchor: anchor }}
      >
        <b className="tip-t">{t(`tips.${id}.title`)}</b>
        <span className="tip-b">{t(`tips.${id}.body`)}</span>
        {example ? <span className="tip-ex">{example}</span> : null}
        <span className="tip-f">
          <button type="button" className="tip-more" onClick={moreHelp}>
            {t("tip.more")}
            <Icon name="arrow" small />
          </button>
          <button
            type="button"
            className="btn sm tip-ok"
            popoverTarget={popover}
            popoverTargetAction="hide"
          >
            {t("tip.ok")}
          </button>
        </span>
      </span>
    </>
  );
}

/**
 * Tiêu đề mục kèm nút ⓘ. Nút nằm cạnh (không nằm trong) thẻ tiêu đề, để tên của tiêu đề — cái mà
 * `aria-labelledby` của mục và trình đọc màn hình dùng — giữ đúng chữ của nó.
 */
export function TipHeading({
  id,
  tip,
  className = "h2",
  children,
}: {
  id: string;
  tip: TipId;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="tip-head">
      <h2 id={id} className={className}>
        {children}
      </h2>
      <InfoTip id={tip} />
    </div>
  );
}
