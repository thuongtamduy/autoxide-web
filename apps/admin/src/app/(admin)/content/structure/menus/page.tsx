import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LegacyMenuCard } from "@/components/structure/legacy-menu";
import { loadLegacyMenus } from "@/lib/legacy-menus";
import { sampleDataEnabled } from "@/sample";

// Tab "Menu": menu của website đã chuyển sang module riêng `menus` (menu trỏ tới bản ghi của mọi
// module). Menu cũ của `content` (`/api/v1/content/menus`, sắp ngừng) chỉ hiện để đọc, làm nguồn
// cho "Nhập menu cũ" ở màn Menu; không dựng trình sửa trên API cũ.
export default async function LegacyMenusTab() {
  const t = await getTranslations("structure.menus");
  const menus = await loadLegacyMenus();
  const screen = sampleDataEnabled();
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="st-menus-h">
        <div className="block-head">
          <h2 id="st-menus-h" className="h2">
            {t("title")}
          </h2>
          {screen ? (
            <Link className="btn sm pri" href="/content/menus">
              {t("open")}
            </Link>
          ) : null}
        </div>
        <p className="note">{t("moved")}</p>
        {menus === null ? (
          <p className="fhint">{t("unavailable")}</p>
        ) : menus.length === 0 ? (
          <div className="card">
            <p className="empty">{t("empty")}</p>
          </div>
        ) : (
          <ul className="st-tiles">
            {menus.map((menu) => (
              <LegacyMenuCard key={menu.id} menu={menu} />
            ))}
          </ul>
        )}
        {screen && menus && menus.length > 0 ? (
          <Link className="btn sm" href="/content/menus#import">
            {t("import")}
          </Link>
        ) : null}
      </section>
    </div>
  );
}
