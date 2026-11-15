import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SiteChips } from "@/components/content/sample-sites";
import { MenuEditor } from "@/components/menus/menu-editor";
import { ImportPanel, NewMenuDialog } from "@/components/menus/menu-forms";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { Icon } from "@/components/shell/icon";
import { LegacyMenuCard } from "@/components/structure/legacy-menu";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { loadLegacyMenus } from "@/lib/legacy-menus";
import { MENUS_MANAGE, MENUS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listWebsites } from "@/sample/content";
import { getMenu, listMenus, listRefKinds, listRefObjects, today } from "@/sample/menus";
import { removeMenu } from "./actions";
import "@/components/menus/menus.css";

const ENDPOINTS =
  "GET/POST /api/v1/menus, GET/PUT/DELETE /api/v1/menus/{id}, GET /api/v1/menus/public/{key}";

// Màn "Menu" của website: chờ module `menus` của core (đề bài `docs/prompts/menus-module.md`), nên
// cả màn dựng bằng dữ liệu mẫu (W-006) theo đúng hình dạng API trong đề bài. Menu cũ của `content`
// (`/api/v1/content/menus`, sắp ngừng) đọc THẬT, chỉ để làm nguồn "Nhập menu cũ".
export default async function MenusPage(props: PageProps<"/content/menus">) {
  const t = await getTranslations("menus");
  if (!sampleDataEnabled()) notFound();
  if (!(await can(MENUS_READ))) {
    const errors = await getTranslations("errors");
    return (
      <MessagePanel
        title={errors("forbiddenTitle")}
        message={errors("forbidden", { permission: MENUS_READ })}
      />
    );
  }
  const params = await props.searchParams;
  const { data: websites } = await listWebsites();
  const website = websites.find((w) => w.id === params.site) ?? websites[0];
  if (!website) notFound();
  const [{ data: summaries }, { data: kinds }, { data: objects }, legacy, manage] =
    await Promise.all([
      listMenus(website.id),
      listRefKinds(),
      listRefObjects(),
      loadLegacyMenus(),
      can(MENUS_MANAGE),
    ]);
  // Chưa chọn thì mở menu `main` (thanh danh mục), như bản thiết kế.
  const chosen =
    typeof params.menu === "string"
      ? summaries.find((m) => m.id === params.menu)
      : (summaries.find((m) => m.key === "main") ?? summaries[0]);
  const opened = chosen ? await getMenu(chosen.id) : null;
  const keys = [...new Set(summaries.map((m) => m.key))];
  const href = (change: { site?: string; menu?: string }) => {
    const query = new URLSearchParams();
    query.set("site", change.site ?? website.id);
    if (change.menu) query.set("menu", change.menu);
    return `/content/menus?${query}`;
  };

  return (
    <div className="page mn-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          <span className="mn-sample">
            <SampleBadge step="mới" module="menus" endpoint={ENDPOINTS} />
          </span>
        </div>
        {manage ? (
          <div className="headacts">
            <a className="btn" href="#import">
              <Icon name="down" />
              {t("importButton")}
            </a>
            <NewMenuDialog
              websiteId={website.id}
              copyFrom={summaries.map((m) => ({
                id: m.id,
                label: `${m.key} · ${m.locale.toUpperCase()}`,
              }))}
            />
          </div>
        ) : null}
      </section>

      <SiteChips
        websites={websites}
        current={website.id}
        hrefFor={Object.fromEntries(websites.map((w) => [w.id, href({ site: w.id })]))}
      />

      <section className="block" aria-labelledby="mn-list-h">
        <div className="block-head">
          <h2 id="mn-list-h" className="h2">
            {t("listTitle", { domain: website.domain })}
          </h2>
        </div>
        <p className="fhint">{t("fallback")}</p>
        <div className="card tcard">
          {summaries.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("menu")}</Th>
                  <Th>{t("locales")}</Th>
                  <Th className="text-right">{t("items")}</Th>
                  <Th>{t("updated")}</Th>
                  <Th className="text-right">{t("actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const versions = summaries.filter((m) => m.key === key);
                  const first = versions[0];
                  return (
                    <tr
                      key={key}
                      data-current={versions.some((m) => m.id === chosen?.id) ? "" : undefined}
                    >
                      <Td className="rt-title">
                        <span className="cell2">
                          <b className="mono">{key}</b>
                          <span className="sub">
                            {t.has(`keys.${key}`) ? t(`keys.${key}`) : t("keys.other")}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("locales")}>
                        <span className="chips">
                          {versions.map((m) => (
                            <Link
                              key={m.id}
                              className={m.id === chosen?.id ? "chip on" : "chip"}
                              href={href({ menu: m.id })}
                              aria-current={m.id === chosen?.id ? "true" : undefined}
                            >
                              {m.locale.toUpperCase()} · v{m.version}
                            </Link>
                          ))}
                        </span>
                      </Td>
                      <Td label={t("items")} className="num text-right">
                        {first?.item_count ?? 0}
                      </Td>
                      <Td label={t("updated")} className="whitespace-nowrap">
                        {first ? (
                          <>
                            {first.updated_by} · <Time value={first.updated_at} />
                          </>
                        ) : null}
                      </Td>
                      <Td className="text-right">
                        <span className="row-acts">
                          {first ? (
                            <Link className="btn sm" href={href({ menu: first.id })}>
                              {t("edit")}
                            </Link>
                          ) : null}
                          {manage && first ? (
                            <ConfirmAction
                              action={removeMenu}
                              id={first.id}
                              label={t("delete")}
                              title={t("deleteTitle", { key, locale: first.locale.toUpperCase() })}
                              points={[t("deleteStore"), t("deleteOther")]}
                              submit={t("delete")}
                              done={t("deleted")}
                            />
                          ) : null}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      </section>

      {opened?.ok ? (
        <section className="block" aria-label={t("editorLabel")}>
          <MenuEditor
            key={`${opened.data.menu.id}:${opened.data.etag}`}
            menu={opened.data.menu}
            etag={opened.data.etag}
            kinds={kinds}
            objects={objects}
            today={today()}
          />
        </section>
      ) : (
        <p className="note">{t("pick")}</p>
      )}

      <section className="block" id="import" aria-labelledby="mn-import-h">
        <div className="block-head">
          <h2 id="mn-import-h" className="h2">
            {t("import.title")}
          </h2>
          <span className="badge b-warn">{t("import.sunset")}</span>
        </div>
        <p className="fhint">{t("import.about")}</p>
        <ul className="mn-apis">
          <li>
            <del className="mono">GET/PUT /api/v1/content/menus/{"{key}"}</del>
            <span aria-hidden="true">→</span>
            <span className="mono">GET/PUT/DELETE /api/v1/menus/{"{id}"}</span>
          </li>
          <li>
            <del className="mono">GET /api/v1/content/public/menus/{"{key}"}</del>
            <span aria-hidden="true">→</span>
            <span className="mono">GET /api/v1/menus/public/{"{key}"}?locale&amp;site</span>
          </li>
        </ul>
        <p className="fhint">{t("import.rules")}</p>
        {legacy === null ? (
          <p className="note warn">{t("import.unavailable")}</p>
        ) : legacy.length === 0 ? (
          <p className="fhint">{t("import.none")}</p>
        ) : (
          <ul className="st-tiles">
            {legacy.map((menu) => (
              <LegacyMenuCard key={menu.id} menu={menu} />
            ))}
          </ul>
        )}
        {manage ? (
          <ImportPanel websiteId={website.id} hasLegacy={(legacy?.length ?? 0) > 0} />
        ) : null}
      </section>
    </div>
  );
}
