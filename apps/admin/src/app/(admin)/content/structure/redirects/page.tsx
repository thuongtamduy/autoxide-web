import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { RedirectDialog } from "@/components/structure/forms";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { ConfirmAction } from "@/components/ui/confirm";
import { Pager } from "@/components/ui/pager";
import { RowMenu } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { contentLocaleFor } from "@/lib/client-config";
import { optional } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { CONTENT_MANAGE } from "@/lib/permissions";
import { can } from "@/lib/viewer";
import { bulkDeleteRedirects, deleteRedirect } from "../actions";

const SOURCES = ["auto", "manual", "gone"] as const;
type Source = (typeof SOURCES)[number];
const BADGE: Record<string, string> = {
  auto: "badge b-info",
  manual: "badge b-draft",
  gone: "badge b-arch",
};

// Tab "Chuyển hướng": khi đường dẫn công khai đổi, core tự tạo chuyển hướng 301 (`auto`); bài gỡ
// hẳn trả 410 (`gone`); người quản trị thêm tay (`manual`). Lọc theo nguồn ở core (`source`). Dòng có
// nút Sửa và "⋯" (Xoá); chọn nhiều để xoá (lặp lệnh từng cái của core).
export default async function RedirectsTab(props: PageProps<"/content/structure/redirects">) {
  const t = await getTranslations("structure.redirects");
  const tt = await getTranslations("table");
  const params = await props.searchParams;
  const source = SOURCES.find((s) => s === params.source) as Source | undefined;
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const uiLocale = await getLocale();
  const defaultLocale = await contentLocaleFor(uiLocale);
  let page: Awaited<ReturnType<typeof loadPage>>;
  try {
    page = await loadPage(source, cursor);
  } catch (error) {
    if (isForbidden(error)) {
      const errors = await getTranslations("errors");
      return (
        <MessagePanel
          title={errors("forbiddenTitle")}
          message={errors("forbidden", { permission: CONTENT_MANAGE })}
        />
      );
    }
    throw error;
  }
  // Bài và trang có thể làm đích (200 bài mới sửa gần nhất), và để hiện tên đích theo id.
  const entries =
    (
      await optional(
        load((c) =>
          c.GET("/api/v1/content/entries", {
            params: { query: { limit: 200, sort: "updated_at", order: "desc" } },
          }),
        ),
      )
    )?.data ?? [];
  // Xoá cần `content.manage` (core kiểm lại): người chỉ đọc không có ô chọn.
  const manage = await can(CONTENT_MANAGE);
  const titles = new Map(entries.map((e) => [e.id, e.title]));
  const choices = entries.map((e) => ({
    id: e.id,
    label: `${e.title} · ${e.locale.toUpperCase()} · ${e.kind}`,
  }));
  const href = (s?: Source) =>
    s ? `/content/structure/redirects?source=${s}` : "/content/structure/redirects";

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="st-red-h">
        <div className="block-head">
          <h2 id="st-red-h" className="h2">
            {t("title")}
          </h2>
          <RedirectDialog entries={choices} defaultLocale={defaultLocale} />
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("filter")}>
          <Link
            className={source ? "chip" : "chip on"}
            href={href()}
            aria-current={source ? undefined : "true"}
          >
            {t("all")}
          </Link>
          {SOURCES.map((s) => (
            <Link
              key={s}
              className={source === s ? "chip on" : "chip"}
              href={href(s)}
              aria-current={source === s ? "true" : undefined}
            >
              {t(`sources.${s}`)}
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <BulkTable
              ids={page.data.map((r) => r.id)}
              actions={
                manage
                  ? [
                      {
                        key: "delete",
                        label: t("delete"),
                        tone: "danger",
                        run: bulkDeleteRedirects,
                        confirm: {
                          title: t("bulkDeleteTitle"),
                          points: [t("deleteOld"), t("deleteSearch")],
                          submit: t("delete"),
                        },
                      },
                    ]
                  : []
              }
            >
              <Table cards>
                <thead>
                  <tr>
                    {manage ? <SelectAllTh /> : null}
                    <Th>{t("from")}</Th>
                    <Th>{t("toCol")}</Th>
                    <Th>{t("kind")}</Th>
                    <Th>{t("updated")}</Th>
                    <Th className="text-right">{t("actions")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.data.map((redirect) => (
                    <tr key={redirect.id}>
                      {manage ? <SelectTd id={redirect.id} name={redirect.from_path} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <span className="mono open ell">{redirect.from_path}</span>
                          <span className="sub">{redirect.locale.toUpperCase()}</span>
                        </span>
                      </Td>
                      <Td label={t("toCol")}>
                        <span className="mono ell">
                          {redirect.status_code === 410
                            ? "—"
                            : redirect.to_url
                              ? redirect.to_url
                              : redirect.to_entry_id
                                ? t("toEntryShown", {
                                    title:
                                      titles.get(redirect.to_entry_id) ??
                                      redirect.to_entry_id.slice(0, 8),
                                  })
                                : "—"}
                        </span>
                      </Td>
                      <Td label={t("kind")}>
                        <span className={BADGE[redirect.source] ?? "badge"}>
                          <span className="dot" />
                          {t.has(`sources.${redirect.source}`)
                            ? t(`sources.${redirect.source}`)
                            : redirect.source}
                        </span>{" "}
                        <span className="num">{redirect.status_code}</span>
                      </Td>
                      <Td label={t("updated")} className="whitespace-nowrap">
                        <Time value={redirect.updated_at} />
                      </Td>
                      <Td className="text-right">
                        {/* Một nút phụ trên dòng (Sửa), còn lại trong "⋯" (W-058). */}
                        <span className="row-acts">
                          <RedirectDialog
                            redirect={redirect}
                            entries={choices}
                            defaultLocale={defaultLocale}
                          />
                          <RowMenu
                            label={tt("moreFor", { name: redirect.from_path })}
                            items={[
                              {
                                label: t("delete"),
                                danger: true,
                                dialog: (
                                  <ConfirmAction
                                    action={deleteRedirect}
                                    id={redirect.id}
                                    label={t("delete")}
                                    title={t("deleteTitle", { path: redirect.from_path })}
                                    points={[t("deleteOld"), t("deleteSearch")]}
                                    submit={t("delete")}
                                    done={t("deleted")}
                                  />
                                ),
                              },
                            ]}
                          />
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </BulkTable>
          )}
        </div>
        {/* Core phân trang theo con trỏ, không trả tổng; chưa có tìm theo chữ (`q`) cho chuyển hướng. */}
        <Pager
          first={cursor ? href(source) : null}
          next={
            page.pagination.next_cursor
              ? `${href(source)}${source ? "&" : "?"}cursor=${encodeURIComponent(page.pagination.next_cursor)}`
              : null
          }
        />
      </section>
    </div>
  );
}

function loadPage(source: Source | undefined, cursor: string | undefined) {
  return load((c) =>
    c.GET("/api/v1/content/redirects", {
      params: {
        query: { limit: 50, ...(source ? { source } : {}), ...(cursor ? { cursor } : {}) },
      },
    }),
  );
}
