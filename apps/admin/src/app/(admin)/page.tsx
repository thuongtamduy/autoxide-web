import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/shell/icon";
import { getMe, getModules } from "@/lib/viewer";
import { visibleNav } from "@/nav/nav";

// Tổng quan: lời chào và lối vào mọi phân hệ người này dùng được. Số liệu và hộp việc gom từ
// các phân hệ cần API của core (bước 51, 52); khi có thì thêm vào trang này.
export default async function DashboardPage() {
  const t = await getTranslations();
  const [me, modules] = await Promise.all([getMe(), getModules()]);
  const groups = visibleNav({
    allPermissions: me.all_permissions,
    permissions: me.permissions,
    modules: modules?.map((m) => m.name) ?? null,
  }).filter((group) => group.id !== "home");

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="h1">{t("dashboard.hello", { name: me.name || me.email })}</h1>
        <p className="max-w-3xl text-muted-foreground">{t("dashboard.description")}</p>
      </div>
      <section className="grid gap-3" aria-labelledby="areas">
        <h2 id="areas" className="cap">
          {t("shell.areas")}
        </h2>
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(260px,100%),1fr))]">
          {groups.map((group) =>
            group.pages.map((page) => (
              <Link
                key={`${group.id}/${page.id}`}
                href={page.href}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 no-underline hover:bg-muted"
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-lg bg-accent text-primary">
                  <Icon name={group.icon} />
                </span>
                <span className="grid gap-1">
                  <b>
                    {t(`nav.groups.${group.id}`)} › {t(`nav.pages.${page.id}`)}
                  </b>
                  <span className="text-[13px] text-muted-foreground">
                    {t(`nav.about.${page.id}`)}
                  </span>
                </span>
              </Link>
            )),
          )}
        </div>
        {groups.length === 0 ? (
          <p className="text-muted-foreground">{t("dashboard.nothing")}</p>
        ) : null}
      </section>
    </div>
  );
}
