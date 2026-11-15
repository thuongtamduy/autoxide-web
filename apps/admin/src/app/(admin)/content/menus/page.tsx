import { ApiError } from "@autoxide/sdk";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MenuEditor } from "@/components/menus/menu-editor";
import { NewMenuDialog } from "@/components/menus/menu-forms";
import { MessagePanel } from "@/components/message-panel";
import { SampleBadge } from "@/components/sample-badge";
import { LegacyMenuCard } from "@/components/structure/legacy-menu";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CORE_REF_KINDS, importPlan } from "@/lib/menus";
import {
  loadContentTargets,
  loadLegacy,
  loadMenu,
  loadMenus,
  loadPublicMenu,
} from "@/lib/menus-server";
import { MENUS_MANAGE, MENUS_READ } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { sampleDataEnabled } from "@/sample";
import { listSampleRefKinds, listSampleRefObjects } from "@/sample/menus";
import { removeMenu } from "./actions";
import "@/components/menus/menus.css";

/** Phần core chưa có (W-006): sổ đối tượng của các loại thương mại. */
const SAMPLE_ENDPOINTS =
  "GET /api/v1/kernel/resources/kinds, GET /api/v1/kernel/resources?kind&q (catalog.category, promotions.promotion, marketplace.seller, organizations.store)";

// Màn "Menu" của website: module `menus` THẬT của core (D-238) — danh sách, đọc, tạo, lưu cả cây
// (`If-Match`), xoá, menu công khai. Đích là bài, trang, danh mục thật (đọc qua API của `content`);
// loại thương mại chưa có trong core là dữ liệu mẫu (W-006), core từ chối khi lưu. Menu cũ của
// `content` (deprecated) chỉ đọc, để xem trước lệnh nhập chạy trên máy chủ.
export default async function MenusPage(props: PageProps<"/content/menus">) {
  const t = await getTranslations("menus");
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
  const sample = sampleDataEnabled();
  let summaries: Awaited<ReturnType<typeof loadMenus>>;
  try {
    summaries = await loadMenus();
  } catch (error) {
    // Core chưa cài module `menus`: không có endpoint.
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  }
  // Chưa chọn (hay menu đã chọn vừa bị xoá) thì mở menu `main` (thanh danh mục), như bản thiết kế.
  const chosen =
    summaries.find((m) => m.id === params.menu) ??
    summaries.find((m) => m.key === "main") ??
    summaries[0];
  const [opened, manage, legacy, sampleKinds, sampleObjects] = await Promise.all([
    chosen ? loadMenu(chosen.id) : null,
    can(MENUS_MANAGE),
    loadLegacy(),
    sample ? listSampleRefKinds() : { data: [] },
    sample ? listSampleRefObjects() : { data: [] },
  ]);
  const [targets, live] = opened
    ? await Promise.all([
        loadContentTargets(opened.menu.locale),
        loadPublicMenu(opened.menu.key, opened.menu.locale),
      ])
    : [[], null];
  const keys = [...new Set(summaries.map((m) => m.key))];
  const href = (menu: string) => `/content/menus?menu=${menu}`;
  const plan = legacy ? importPlan(legacy.menus, summaries) : [];
  // Header `Sunset` là ngày HTTP (RFC 8594); không đọc được thì không hiện.
  const sunsetAt = legacy?.sunset ? Date.parse(legacy.sunset) : Number.NaN;
  const sunset = Number.isNaN(sunsetAt) ? null : new Date(sunsetAt).toISOString();

  return (
    <div className="page mn-page">
      <section className="phead">
        <div className="phead-main">
          <span className="crumb">{t("crumb")}</span>
          <h1 className="h1">{t("title")}</h1>
          <p className="pdesc">{t("description")}</p>
          {sample ? (
            <span className="mn-sample">
              <SampleBadge step="mới" endpoint={SAMPLE_ENDPOINTS} />
              <span className="fhint">{t("sampleNote")}</span>
            </span>
          ) : null}
        </div>
        {manage ? (
          <div className="headacts">
            <a className="btn" href="#import">
              {t("importButton")}
            </a>
            <NewMenuDialog
              copyFrom={summaries.map((m) => ({
                id: m.id,
                label: `${m.key} · ${m.locale.toUpperCase()}`,
              }))}
            />
          </div>
        ) : null}
      </section>

      <section className="block" aria-labelledby="mn-list-h">
        <div className="block-head">
          <h2 id="mn-list-h" className="h2">
            {t("listTitle")}
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
                  <Th>{t("updated")}</Th>
                  <Th className="text-right">{t("actions")}</Th>
                </tr>
              </thead>
              <tbody>
                {keys.map((key) => {
                  const versions = summaries.filter((m) => m.key === key);
                  const shown = versions.find((m) => m.id === chosen?.id) ?? versions[0];
                  const latest = versions.reduce((a, b) => (a.updated_at > b.updated_at ? a : b));
                  return (
                    <tr key={key} data-current={shown?.id === chosen?.id ? "" : undefined}>
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
                              href={href(m.id)}
                              aria-current={m.id === chosen?.id ? "true" : undefined}
                            >
                              {m.locale.toUpperCase()}
                            </Link>
                          ))}
                        </span>
                      </Td>
                      <Td label={t("updated")} className="whitespace-nowrap">
                        <Time value={latest.updated_at} />
                      </Td>
                      <Td className="text-right">
                        <span className="row-acts">
                          {shown ? (
                            <Link className="btn sm" href={href(shown.id)}>
                              {t("edit")}
                            </Link>
                          ) : null}
                          {manage && shown ? (
                            <ConfirmAction
                              action={removeMenu}
                              id={shown.id}
                              label={t("delete")}
                              title={t("deleteTitle", { key, locale: shown.locale.toUpperCase() })}
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

      {opened ? (
        <section className="block" aria-label={t("editorLabel")}>
          <MenuEditor
            key={opened.menu.id}
            menu={opened.menu}
            etag={opened.etag}
            kinds={[...CORE_REF_KINDS, ...sampleKinds.data]}
            objects={[...targets, ...sampleObjects.data]}
            live={live}
            now={new Date().toISOString()}
          />
        </section>
      ) : (
        <p className="note">{summaries.length === 0 ? t("startHint") : t("pick")}</p>
      )}

      <section className="block" id="import" aria-labelledby="mn-import-h">
        <div className="block-head">
          <h2 id="mn-import-h" className="h2">
            {t("import.title")}
          </h2>
          {sunset ? (
            <span className="badge b-warn">
              {t("import.sunset")} <Time value={sunset} date />
            </span>
          ) : null}
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
            <span className="mono">GET /api/v1/menus/public/{"{key}"}?locale</span>
          </li>
        </ul>
        <p className="fhint">{t("import.rules")}</p>
        {legacy === null ? (
          <p className="note warn">{t("import.unavailable")}</p>
        ) : legacy.menus.length === 0 ? (
          <p className="fhint">{t("import.none")}</p>
        ) : (
          <>
            <h3 className="cap">{t("import.preview")}</h3>
            <ul className="mn-improws" aria-label={t("import.result")}>
              {plan.map((row) => (
                <li key={`${row.key}-${row.locale}`} className="mn-improw">
                  <span className="mono">
                    {row.key} · {row.locale.toUpperCase()}
                  </span>
                  <span className={row.status === "create" ? "badge b-ok" : "badge b-draft"}>
                    {t(`import.status.${row.status}`)}
                  </span>
                  <span className="fhint">{t("import.items", { count: row.items })}</span>
                </li>
              ))}
            </ul>
            <p className="fhint">{t("import.command")}</p>
            <pre className="mn-cmd mono">autoxide task menus.import_content_menus</pre>
            <ul className="st-tiles">
              {legacy.menus.map((menu) => (
                <LegacyMenuCard key={menu.id} menu={menu} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
