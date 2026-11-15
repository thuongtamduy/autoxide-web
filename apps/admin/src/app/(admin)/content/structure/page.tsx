import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EntryStatusBadges } from "@/components/content/status";
import { MessagePanel } from "@/components/message-panel";
import { MovePageDialog } from "@/components/structure/forms";
import { Table, Td, Th } from "@/components/ui/table";
import { abilities, CONTENT_LOCALES, type Entry } from "@/lib/content";
import { isForbidden, load } from "@/lib/core";
import { CONTENT_READ } from "@/lib/permissions";
import { flattenTree, pagePath, parentChoices } from "@/lib/structure";
import { getMe } from "@/lib/viewer";

// Tab "Trang": mọi trang (cả bản nháp) xếp thành cây cha con theo `parent_id`, đường dẫn ghép theo
// cây. "Chuyển trang cha" gọi `POST /content/entries/{id}/move`: core đổi đường dẫn của cả cây con
// và tự tạo chuyển hướng từ đường dẫn cũ. Mở trang thì dùng trình soạn có sẵn.
export default async function PagesTab(props: PageProps<"/content/structure">) {
  const t = await getTranslations("structure.pages");
  const { locale: wanted } = await props.searchParams;
  const locale = (CONTENT_LOCALES as readonly string[]).includes(String(wanted))
    ? String(wanted)
    : "";
  let pages: Entry[];
  let more = false;
  try {
    const page = await load((c) =>
      c.GET("/api/v1/content/entries", {
        params: { query: { kind: "page", limit: 200, sort: "created_at", order: "asc" } },
      }),
    );
    pages = page.data;
    more = Boolean(page.pagination.next_cursor);
  } catch (error) {
    if (isForbidden(error)) {
      const errors = await getTranslations("errors");
      return (
        <MessagePanel
          title={errors("forbiddenTitle")}
          message={errors("forbidden", { permission: CONTENT_READ })}
        />
      );
    }
    throw error;
  }
  const canWrite = abilities(await getMe()).write;
  const shown = locale ? pages.filter((p) => p.locale === locale) : pages;
  const rows = flattenTree(shown, (a, b) => a.title.localeCompare(b.title));
  const groups = new Map<string, string[]>();
  for (const page of pages) {
    groups.set(page.translation_group_id, [
      ...(groups.get(page.translation_group_id) ?? []),
      page.locale,
    ]);
  }
  const label = (page: Entry) => `${pagePath(page, pages)} · ${page.title || t("untitled")}`;

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="st-pages-h">
        <div className="block-head">
          <h2 id="st-pages-h" className="h2">
            {t("title")}
          </h2>
        </div>
        <p className="fhint">{t("about")}</p>
        <nav className="chips" aria-label={t("locales")}>
          <Link
            className={locale ? "chip" : "chip on"}
            href="/content/structure"
            aria-current={locale ? undefined : "true"}
          >
            {t("allLocales")} <span className="cnt">{pages.length}</span>
          </Link>
          {CONTENT_LOCALES.map((code) => (
            <Link
              key={code}
              className={locale === code ? "chip on" : "chip"}
              href={`/content/structure?locale=${code}`}
              aria-current={locale === code ? "true" : undefined}
            >
              {code.toUpperCase()}{" "}
              <span className="cnt">{pages.filter((p) => p.locale === code).length}</span>
            </Link>
          ))}
        </nav>
        <div className="card tcard">
          {rows.length === 0 ? (
            <p className="empty">{t("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <Th>{t("page")}</Th>
                  <Th>{t("path")}</Th>
                  <Th>{t("languages")}</Th>
                  <Th>{t("status")}</Th>
                  {canWrite ? <Th className="text-right">{t("actions")}</Th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ node: page, depth, parent, children }) => (
                  <tr key={page.id}>
                    <Td className="rt-title">
                      <span
                        className="cell2 st-tree"
                        style={{ paddingInlineStart: `${depth * 22}px` }}
                      >
                        <Link className="open" href={`/content/${page.id}`}>
                          {depth > 0 ? (
                            <span aria-hidden="true" className="st-branch">
                              └{" "}
                            </span>
                          ) : null}
                          {page.title || t("untitled")}
                        </Link>
                        <span className="sub">
                          {parent
                            ? t("under", { title: parent.title || t("untitled") })
                            : t("level1")}
                          {children > 0 ? ` · ${t("children", { count: children })}` : ""}
                        </span>
                      </span>
                    </Td>
                    <Td label={t("path")}>
                      <span className="mono ell">{pagePath(page, pages)}</span>
                    </Td>
                    <Td label={t("languages")}>
                      {[...new Set(groups.get(page.translation_group_id) ?? [page.locale])]
                        .sort()
                        .map((code) => code.toUpperCase())
                        .join(" · ")}
                    </Td>
                    <Td label={t("status")}>
                      <EntryStatusBadges entry={page} />
                    </Td>
                    {canWrite ? (
                      <Td className="text-right">
                        <MovePageDialog
                          page={{
                            id: page.id,
                            title: page.title,
                            parent_id: page.parent_id ?? null,
                            updated_at: page.updated_at,
                          }}
                          choices={parentChoices(page, pages).map((p) => ({
                            id: p.id,
                            label: label(p),
                          }))}
                        />
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
        {more ? <p className="fhint">{t("more")}</p> : null}
      </section>
    </div>
  );
}
