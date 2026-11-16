import { useTranslations } from "next-intl";
import { Time } from "@/components/ui/time";
import type { LegacyMenu, LegacyMenuItem } from "@/lib/structure";
import { countItems } from "@/lib/structure";

/** Một menu cũ của `content` ở chế độ chỉ đọc: khoá, ngôn ngữ, cây mục và đích của từng mục. */
export function LegacyMenuCard({ menu }: { menu: LegacyMenu }) {
  const t = useTranslations("structure.menus");
  return (
    <li className="card st-tile">
      <span className="st-tile-head">
        <span className="cell2">
          <b className="mono">{menu.key}</b>
          <span className="sub">
            {menu.locale.toUpperCase()} · {t("items", { count: countItems(menu.items) })} ·{" "}
            <Time value={menu.updated_at} />
          </span>
        </span>
        <span className="badge b-arch">{t("readOnly")}</span>
      </span>
      {menu.items.length === 0 ? (
        <p className="fhint">{t("noItems")}</p>
      ) : (
        <ItemList items={menu.items} />
      )}
    </li>
  );
}

function ItemList({ items }: { items: readonly LegacyMenuItem[] }) {
  const t = useTranslations("structure.menus");
  return (
    <ul className="st-menutree">
      {items.map((item) => (
        <li key={item.id}>
          <span className="st-menuitem">
            <b>{item.label}</b>
            <span className="fhint mono ell">
              {item.url
                ? item.url
                : item.entry_id
                  ? t("toEntry", { id: item.entry_id.slice(0, 8) })
                  : item.term_id
                    ? t("toTerm", { id: item.term_id.slice(0, 8) })
                    : t("noTarget")}
            </span>
          </span>
          {item.children.length > 0 ? <ItemList items={item.children} /> : null}
        </li>
      ))}
    </ul>
  );
}
