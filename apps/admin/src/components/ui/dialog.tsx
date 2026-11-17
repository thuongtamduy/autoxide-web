"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  Fragment,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Icon } from "@/components/shell/icon";

/**
 * Hộp thoại do nơi khác mở (mục của menu "⋯" trên dòng): `Dialog` nằm trong context này thì ẩn nút
 * mở, tự mở khi gắn và báo `onClose` khi đóng. Menu đã đóng (popover ẩn) mà hộp thoại vẫn hiện, vì
 * nó được dựng ngoài popover.
 */
export const DialogHostContext = createContext<{ onClose: () => void } | null>(null);

/**
 * Nút mở một hộp thoại (`<dialog>` của HTML: Esc để đóng, giữ con trỏ bên trong). Nội dung
 * dựng lại mỗi lần mở, nên form bắt đầu trống và câu báo cũ không còn.
 */
export function Dialog({
  label,
  title,
  intro,
  triggerClass = "btn sm",
  hideTrigger = false,
  ariaLabel,
  children,
}: {
  label: string;
  /** Tên đầy đủ của nút mở khi nhãn ngắn lặp lại trên nhiều dòng (vd "Hoãn việc: …"). */
  ariaLabel?: string | undefined;
  title: string;
  intro?: ReactNode;
  triggerClass?: string;
  /** Ẩn nút mở nhưng giữ hộp thoại (vd đang hiện mã khôi phục khi trạng thái vừa đổi). */
  hideTrigger?: boolean;
  children: (close: () => void) => ReactNode;
}) {
  const t = useTranslations("shell");
  const ref = useRef<HTMLDialogElement>(null);
  const [round, setRound] = useState(0);
  const titleId = useId();
  const close = () => ref.current?.close();
  const host = useContext(DialogHostContext);
  useEffect(() => {
    if (!host) return;
    setRound((n) => n + 1);
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
  }, [host]);
  return (
    <>
      <button
        type="button"
        className={triggerClass}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        hidden={hideTrigger || host !== null}
        onClick={() => {
          setRound((n) => n + 1);
          ref.current?.showModal();
        }}
      >
        {label}
      </button>
      <dialog ref={ref} className="axdlg" aria-labelledby={titleId} onClose={host?.onClose}>
        <div className="dlg-head">
          <h2 id={titleId} className="h2">
            {title}
          </h2>
          <button type="button" className="btn ghost sq" aria-label={t("close")} onClick={close}>
            <Icon name="x" />
          </button>
        </div>
        {intro ? <div className="dlg-intro">{intro}</div> : null}
        <Fragment key={round}>{round > 0 ? children(close) : null}</Fragment>
      </dialog>
    </>
  );
}
