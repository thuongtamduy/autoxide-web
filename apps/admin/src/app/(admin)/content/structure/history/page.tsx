import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { RevisionDiffView } from "@/components/content/revision-diff";
import { MessagePanel } from "@/components/message-panel";
import { RestoreRevisionButton } from "@/components/structure/restore-revision";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { abilities, type Revision } from "@/lib/content";
import { loadEntry, optional } from "@/lib/content-server";
import { isForbidden, load } from "@/lib/core";
import { isUuid } from "@/lib/media";
import { CONTENT_READ } from "@/lib/permissions";
import { diffSnapshots } from "@/lib/revision-diff";
import { getMe } from "@/lib/viewer";

// Tab "Lịch sử phiên bản": chọn một bài, xem mọi phiên bản core giữ, so hai phiên bản (ô nào đổi,
// thân bài khác ở khối nào) và khôi phục một phiên bản thành bản nháp (bản đang đăng không đổi).
// Chọn bài và phiên bản nằm trên địa chỉ (`?entry=&a=&b=`) để mở thẳng được.
export default async function HistoryTab(props: PageProps<"/content/structure/history">) {
  const t = await getTranslations("structure.history");
  const params = await props.searchParams;
  const entryId =
    typeof params.entry === "string" && isUuid(params.entry) ? params.entry : undefined;
  let recent: Awaited<ReturnType<typeof loadRecent>>;
  try {
    recent = await loadRecent();
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
  const found = entryId ? await loadEntry(entryId) : null;
  const revisions: Revision[] = found
    ? ((
        await optional(
          load((c) =>
            c.GET("/api/v1/content/entries/{id}/revisions", {
              params: { path: { id: found.entry.id }, query: { limit: 50 } },
            }),
          ),
        )
      )?.data ?? [])
    : [];
  const pick = (key: "a" | "b", fallback: Revision | undefined) => {
    const value = params[key];
    return revisions.find((r) => r.id === value) ?? fallback;
  };
  const after = pick("b", revisions[0]);
  const before = pick("a", revisions[1]);
  const pair =
    found && before && after && before.id !== after.id
      ? await Promise.all(
          [before, after].map((revision) =>
            optional(
              load((c) =>
                c.GET("/api/v1/content/entries/{id}/revisions/{revision_id}", {
                  params: { path: { id: found.entry.id, revision_id: revision.id } },
                }),
              ),
            ),
          ),
        )
      : null;
  const canWrite = abilities(await getMe()).write;
  const reason = (r: Revision) =>
    t.has(`reasons.${r.reason}`) ? t(`reasons.${r.reason}`) : r.reason;
  const number = (r: Revision) => revisions.length - revisions.indexOf(r);
  const options =
    recent.data.some((e) => e.id === found?.entry.id) || !found
      ? recent.data
      : [found.entry, ...recent.data];

  return (
    <div className="blocks">
      <section className="block" aria-labelledby="st-hist-h">
        <div className="block-head">
          <h2 id="st-hist-h" className="h2">
            {found ? `«${found.entry.title || t("untitled")}»` : t("title")}
          </h2>
          {found ? (
            <Link className="btn sm" href={`/content/${found.entry.id}`}>
              {t("openEditor")}
            </Link>
          ) : null}
        </div>
        <p className="fhint">{t("about")}</p>
        <form className="filters" action="/content/structure/history">
          <label className="fld grow">
            <span className="lab">{t("entry")}</span>
            <select className="inp" name="entry" defaultValue={found?.entry.id ?? ""}>
              <option value="">{t("chooseEntry")}</option>
              {options.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.title || t("untitled")} · {entry.locale.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <span className="filters-acts">
            <button type="submit" className="btn">
              {t("show")}
            </button>
          </span>
        </form>
        {entryId && !found ? <p className="note warn">{t("gone")}</p> : null}
        {found ? (
          <div className="card tcard">
            {revisions.length === 0 ? (
              <p className="empty">{t("none")}</p>
            ) : (
              <Table cards>
                <thead>
                  <tr>
                    <Th>{t("version")}</Th>
                    <Th>{t("reason")}</Th>
                    <Th>{t("compare")}</Th>
                    {canWrite ? <Th className="text-right">{t("actions")}</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {revisions.map((revision, index) => (
                    <tr
                      key={revision.id}
                      data-current={
                        revision.id === after?.id || revision.id === before?.id ? "" : undefined
                      }
                    >
                      <Td className="rt-title">
                        <span className="cell2">
                          <b>{t("number", { n: number(revision) })}</b>
                          <span className="sub">
                            <Time value={revision.created_at} />
                            {index === 0 ? ` · ${t("latest")}` : ""}
                          </span>
                        </span>
                      </Td>
                      <Td label={t("reason")}>{reason(revision)}</Td>
                      <Td label={t("compare")}>
                        <span className="row-acts st-compare">
                          <Link
                            className={revision.id === before?.id ? "chip on" : "chip"}
                            href={`/content/structure/history?entry=${found.entry.id}&a=${revision.id}&b=${after?.id ?? ""}`}
                            aria-current={revision.id === before?.id ? "true" : undefined}
                          >
                            {t("asBefore")}
                          </Link>
                          <Link
                            className={revision.id === after?.id ? "chip on" : "chip"}
                            href={`/content/structure/history?entry=${found.entry.id}&a=${before?.id ?? ""}&b=${revision.id}`}
                            aria-current={revision.id === after?.id ? "true" : undefined}
                          >
                            {t("asAfter")}
                          </Link>
                        </span>
                      </Td>
                      {canWrite ? (
                        <Td className="text-right">
                          <RestoreRevisionButton
                            entryId={found.entry.id}
                            revisionId={revision.id}
                            version={found.version}
                            label={t("number", { n: number(revision) })}
                          />
                        </Td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        ) : null}
      </section>
      {found && before && after ? (
        <section className="block" aria-labelledby="st-diff-h">
          <div className="block-head">
            <h2 id="st-diff-h" className="h2">
              {t("diffTitle", { a: number(before), b: number(after) })}
            </h2>
          </div>
          <div className="card padded">
            {before.id === after.id ? (
              <p className="fhint">{t("sameVersion")}</p>
            ) : pair?.[0] && pair[1] ? (
              <RevisionDiffView
                diff={diffSnapshots(pair[0].data.snapshot ?? null, pair[1].data.snapshot ?? null)}
              />
            ) : (
              <p className="fhint">{t("diffUnavailable")}</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function loadRecent() {
  return load((c) =>
    c.GET("/api/v1/content/entries", {
      params: { query: { limit: 100, sort: "updated_at", order: "desc" } },
    }),
  );
}
