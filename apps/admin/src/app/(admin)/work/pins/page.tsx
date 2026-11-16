import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { restorePinAction, unpinAction } from "@/app/(admin)/work/actions";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { UndoButton } from "@/components/work/undo-button";
import { getMe } from "@/lib/viewer";
import { NAV } from "@/nav/nav";
import { listPins } from "@/sample/work";
import { sampleOnly } from "../sample-gate";

// Tab "Đã ghim": view (danh sách đã lọc) và bản ghi người dùng ghim để mở nhanh. Ghim là của riêng
// người dùng. Chưa có trong lộ trình của core (bước 51 ghi "ghim" ngoài phạm vi): dữ liệu mẫu (W-006).
export default async function PinsPage() {
  sampleOnly();
  const [t, nav, me] = await Promise.all([
    getTranslations("work.pins"),
    getTranslations("nav"),
    getMe(),
  ]);
  const { data: pins } = await listPins(me.id);
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="wk-pins-h">
        <div className="block-head">
          <h2 id="wk-pins-h" className="h2">
            {t("title")}
          </h2>
          <SampleBadge step="mới" endpoint="GET/POST/DELETE /api/v1/me/pins" />
        </div>
        <p className="fhint">{t("about")}</p>
        {pins.length === 0 ? (
          <p className="empty card">{t("empty")}</p>
        ) : (
          <ul className="wk-pins">
            {pins.map((pin) => {
              const icon = NAV.find((g) => g.id === pin.group)?.icon ?? "pin";
              return (
                <li key={pin.id} className="card wk-pin">
                  <span className="sq-ic info">
                    <Icon name={icon} />
                  </span>
                  <span className="wk-main">
                    <span className="wk-title">{t(`kinds.${pin.kind}`, { name: pin.name })}</span>
                    <span className="wk-meta">{nav(`groups.${pin.group}`)}</span>
                  </span>
                  <span className="wk-acts">
                    <Link className="btn sm" href={pin.href}>
                      {t("open")}
                    </Link>
                    <UndoButton
                      action={unpinAction}
                      undoAction={restorePinAction}
                      fields={{ id: pin.id }}
                      label={t("unpin")}
                      ariaLabel={t("unpinLabel", { name: pin.name })}
                      done={t("unpinned")}
                      undo={{ label: t("undo"), done: t("restored") }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
