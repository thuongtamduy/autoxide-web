import { getLocale, getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { TermDialog } from "@/components/structure/forms";
import { ConfirmAction } from "@/components/ui/confirm";
import { Table, Td, Th } from "@/components/ui/table";
import { CONTENT_LOCALES, type Term } from "@/lib/content";
import { isForbidden, load } from "@/lib/core";
import { CONTENT_MANAGE, CONTENT_READ } from "@/lib/permissions";
import { descendants, flattenTree, termName, termSlug } from "@/lib/structure";
import { can } from "@/lib/viewer";
import { deleteTerm } from "../actions";

// Tab "Danh mục và thẻ": cây danh mục (cha con) và danh sách thẻ, tên theo từng ngôn ngữ. Thêm,
// sửa, xoá cần `content.manage`; core từ chối xoá danh mục còn danh mục con.
export default async function TermsTab() {
  const t = await getTranslations("structure.terms");
  const uiLocale = await getLocale();
  const locale = (CONTENT_LOCALES as readonly string[]).includes(uiLocale) ? uiLocale : "en";
  let terms: Term[];
  try {
    terms = (
      await load((c) =>
        c.GET("/api/v1/content/terms", { params: { query: { limit: 200, order: "asc" } } }),
      )
    ).data;
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
  const manage = await can(CONTENT_MANAGE);
  const byName = (a: Term, b: Term) =>
    termName(a, locale).localeCompare(termName(b, locale), locale);
  const categories = terms.filter((term) => term.taxonomy === "category");
  const tags = terms.filter((term) => term.taxonomy === "tag").sort(byName);
  const rows = flattenTree(categories, byName);
  const parentsFor = (term?: Term) => {
    const banned = term ? descendants(term.id, categories) : new Set<string>();
    return rows
      .filter((row) => !banned.has(row.node.id))
      .map((row) => ({
        id: row.node.id,
        label: `${"— ".repeat(row.depth)}${termName(row.node, locale)}`,
      }));
  };
  const languages = (term: Term) =>
    term.names
      .map((n) => n.locale.toUpperCase())
      .sort()
      .join(" · ");

  const table = (
    list: { node: Term; depth: number; parent: Term | null }[],
    taxonomy: "category" | "tag",
  ) =>
    list.length === 0 ? (
      <p className="empty">{t(taxonomy === "category" ? "noCategories" : "noTags")}</p>
    ) : (
      <Table cards>
        <thead>
          <tr>
            <Th>{t(taxonomy === "category" ? "category" : "tag")}</Th>
            <Th>{t("slug")}</Th>
            <Th>{t("languages")}</Th>
            {manage ? <Th className="text-right">{t("actions")}</Th> : null}
          </tr>
        </thead>
        <tbody>
          {list.map(({ node: term, depth, parent }) => (
            <tr key={term.id}>
              <Td className="rt-title">
                <span className="cell2" style={{ paddingInlineStart: `${depth * 22}px` }}>
                  <span className="open">
                    {depth > 0 ? (
                      <span aria-hidden="true" className="st-branch">
                        └{" "}
                      </span>
                    ) : null}
                    {termName(term, locale)}
                  </span>
                  {parent ? (
                    <span className="sub">{t("under", { name: termName(parent, locale) })}</span>
                  ) : null}
                </span>
              </Td>
              <Td label={t("slug")}>
                <span className="mono ell">{termSlug(term, locale)}</span>
              </Td>
              <Td label={t("languages")}>{languages(term)}</Td>
              {manage ? (
                <Td className="text-right">
                  <span className="row-acts">
                    <TermDialog
                      taxonomy={taxonomy}
                      term={term}
                      parents={parentsFor(term)}
                      defaultLocale={locale}
                    />
                    <ConfirmAction
                      action={deleteTerm}
                      id={term.id}
                      label={t("delete")}
                      title={t("deleteTitle", { name: termName(term, locale) })}
                      points={[
                        t("deletePosts"),
                        ...(taxonomy === "category" ? [t("deleteChildren")] : []),
                      ]}
                      submit={t("delete")}
                      done={t("deleted")}
                    />
                  </span>
                </Td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </Table>
    );

  return (
    <div className="blocks">
      <section className="block half" aria-labelledby="st-cat-h">
        <div className="block-head">
          <h2 id="st-cat-h" className="h2">
            {t("categories")}
          </h2>
          {manage ? (
            <TermDialog taxonomy="category" parents={parentsFor()} defaultLocale={locale} />
          ) : null}
        </div>
        <div className="card tcard">{table(rows, "category")}</div>
      </section>
      <section className="block half" aria-labelledby="st-tag-h">
        <div className="block-head">
          <h2 id="st-tag-h" className="h2">
            {t("tags")}
          </h2>
          {manage ? <TermDialog taxonomy="tag" parents={[]} defaultLocale={locale} /> : null}
        </div>
        <div className="card tcard">
          {table(
            tags.map((node) => ({ node, depth: 0, parent: null })),
            "tag",
          )}
        </div>
      </section>
      <p className="fhint st-note">{t("countMissing")}</p>
    </div>
  );
}
