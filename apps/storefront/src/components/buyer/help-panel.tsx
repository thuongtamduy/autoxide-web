import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { routes } from "@/lib/routes";
import { Icon } from "../icon";

/**
 * Nút "Cần giúp?" và bảng trượt bên phải ở đầu trang (bản thiết kế `Checkout`). Chỉ hiện ở trang đặt
 * hàng khép kín (`shop.css`: `.sp:has(.enclosed) .hdr-help`) — ở đó đầu trang không có ô tìm và danh
 * mục, nên đây là lối ra duy nhất tới tra cứu đơn và hỗ trợ. Mở bằng thuộc tính `popover` của HTML:
 * không cần JavaScript, Esc và bấm ra ngoài tự đóng, bàn phím đi được.
 */
export function HelpPanel() {
  const t = useTranslations("help");
  return (
    <>
      <button
        type="button"
        className="iconbtn hdr-help"
        popoverTarget="sf-help"
        aria-label={t("open")}
      >
        <Icon name="help" />
        <span className="hide-mobile">{t("open")}</span>
      </button>
      <div className="helppanel" id="sf-help" popover="auto" role="dialog" aria-label={t("title")}>
        <span className="hp-head">
          <b>{t("title")}</b>
          <button
            type="button"
            className="btn ghost sm"
            popoverTarget="sf-help"
            popoverTargetAction="hide"
            aria-label={t("close")}
          >
            <Icon name="x" small />
          </button>
        </span>
        <span className="hp-hint muted">{t("hint")}</span>
        <span className="hp-link">
          <Icon name="phone" />
          <span>
            <b>{t("call")}</b>
            <span>{t("callHours")}</span>
          </span>
        </span>
        <Link className="hp-link" href={routes.orderLookup()}>
          <Icon name="search" />
          <span>
            <b>{t("lookup")}</b>
            <span>{t("lookupSub")}</span>
          </span>
        </Link>
        <Link className="hp-link" href={routes.account()}>
          <Icon name="user" />
          <span>
            <b>{t("account")}</b>
            <span>{t("accountSub")}</span>
          </span>
        </Link>
        <span className="hp-link">
          <Icon name="ret" />
          <span>
            <b>{t("returns")}</b>
            <span>{t("returnsSub")}</span>
          </span>
        </span>
        <span className="hp-link">
          <Icon name="truck" />
          <span>
            <b>{t("inspect")}</b>
            <span>{t("inspectSub")}</span>
          </span>
        </span>
      </div>
    </>
  );
}
