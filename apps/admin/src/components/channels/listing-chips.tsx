import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ChannelSlot, ChannelState, ListingLike } from "@/lib/channels";

/** Lớp màu của chip theo trạng thái gộp (lớp nhãn có sẵn của khung). */
export const STATE_TONE: Record<ChannelState, string> = {
  live: "b-ok",
  error: "b-bad",
  pending: "b-sched",
  off: "b-draft",
};

/**
 * Các kênh của một sản phẩm trên dòng danh sách "Tin đăng" (như cột "Sales channels" của Shopify):
 * mỗi tài khoản một chip — chấm màu, tên tài khoản, trạng thái. Bấm chip mở dòng chi tiết.
 */
export function ChannelChips<L extends ListingLike>({
  slots,
  href,
}: {
  slots: readonly ChannelSlot<L>[];
  href: string;
}) {
  const t = useTranslations("channels");
  return (
    <ul className="cl-chips">
      {slots.map((s) => (
        <li key={s.account.id}>
          <Link
            href={href}
            scroll={false}
            className={`badge cl-chip ${STATE_TONE[s.state]}`}
            aria-label={t("listings.chipLabel", {
              account: s.account.name,
              kind: t(`kinds.${s.account.kind}`),
              state: s.listing ? t(`listingState.${s.listing.status}`) : t("listings.states.off"),
            })}
          >
            <span className="dot" />
            <span className="cl-chip-name">{s.account.name}</span>
            <span className="cl-chip-state">
              {s.listing && s.state === "off"
                ? t(`listingState.${s.listing.status}`)
                : t(`listings.states.${s.state}`)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
