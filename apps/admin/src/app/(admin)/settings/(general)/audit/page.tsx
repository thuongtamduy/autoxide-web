import type { components } from "@autoxide/sdk";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MessagePanel } from "@/components/message-panel";
import { AutoFilter } from "@/components/ui/auto-filter";
import { Pager } from "@/components/ui/pager";
import { SortTh } from "@/components/ui/sort-th";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { actorNames, auditFilter, auditHref } from "@/lib/audit";
import { isForbidden, load } from "@/lib/core";
import { AUDIT_READ } from "@/lib/permissions";
import { type Keep, readSort, withQuery } from "@/lib/table";
import { getModules } from "@/lib/viewer";

const BASE = "/settings/audit";

// Tab "Nhật ký audit": ai đổi gì, lúc nào; lọc theo module, loại thay đổi, bản ghi, người làm
// (bấm tên người để lọc). Theo trang bằng con trỏ của core (không có tổng). Bộ bảng (W-058): sắp theo
// thời điểm bằng `order` của core (mặc định mới trước); nhật ký chỉ đọc nên không có thao tác hàng loạt.
export default async function AuditPage(props: PageProps<"/settings/audit">) {
  const t = await getTranslations();
  const params = await props.searchParams;
  const filter = auditFilter(params);
  const cursor = typeof params.cursor === "string" ? params.cursor : undefined;
  const sort = readSort(params, ["when"], { field: "when", dir: "desc" });
  const order = typeof params.sort === "string" ? sort.dir : undefined;
  // Tham số của trang (bộ lọc, cách sắp) giữ khi đổi trang hay sắp.
  const filterKeep: Keep = {
    module: filter.module,
    action: filter.action,
    subject: filter.subject,
    actor: filter.actor_user_id,
  };
  const keep: Keep = { ...filterKeep, ...(order ? { sort: "when", dir: order } : {}) };
  let page: components["schemas"]["Page_AuditEntryResponse"];
  try {
    page = await load((client) =>
      client.GET("/api/v1/audit", {
        params: {
          query: {
            ...filter,
            include: "actor",
            limit: 50,
            ...(order ? { order } : {}),
            ...(cursor ? { cursor } : {}),
          },
        },
      }),
    );
  } catch (error) {
    if (isForbidden(error)) {
      return (
        <MessagePanel
          title={t("errors.forbiddenTitle")}
          message={t("errors.forbidden", { permission: AUDIT_READ })}
        />
      );
    }
    throw error;
  }
  // Tên người làm đi cùng mỗi mục (`include=actor`): không gọi thêm cho từng người.
  const modules = await getModules();
  const names = actorNames(page.data);
  const next = page.pagination.next_cursor;
  const a = (key: string, values?: Record<string, string>) => t(`settings.audit.${key}`, values);
  const filtered = Object.keys(filter).length > 0;
  return (
    <div className="blocks">
      <section className="block" aria-labelledby="audit-h">
        <div className="block-head">
          <h2 id="audit-h" className="h2">
            {a("title")}
          </h2>
        </div>
        <p className="fhint">{a("about")}</p>
        <form className="filters" method="get" action={BASE} aria-label={a("filter")}>
          <AutoFilter />
          {modules ? (
            <label className="fld">
              <span className="lab">{a("module")}</span>
              <select className="inp" name="module" defaultValue={filter.module ?? ""}>
                <option value="">{a("anyModule")}</option>
                {modules.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="fld">
              <span className="lab">{a("module")}</span>
              <input className="inp mono" name="module" defaultValue={filter.module ?? ""} />
            </label>
          )}
          <label className="fld">
            <span className="lab">{a("action")}</span>
            <input
              className="inp mono"
              name="action"
              placeholder="auth.user_updated"
              defaultValue={filter.action ?? ""}
            />
          </label>
          <label className="fld">
            <span className="lab">{a("subject")}</span>
            <input
              className="inp mono"
              name="subject"
              placeholder="auth.user:…"
              defaultValue={filter.subject ?? ""}
            />
          </label>
          {filter.actor_user_id ? (
            <input type="hidden" name="actor" value={filter.actor_user_id} />
          ) : null}
          {order ? <input type="hidden" name="sort" value="when" /> : null}
          {order ? <input type="hidden" name="dir" value={order} /> : null}
          <div className="filters-acts">
            <button type="submit" className="btn pri">
              {a("apply")}
            </button>
            {filtered ? (
              <Link className="btn" href={BASE}>
                {a("clear")}
              </Link>
            ) : null}
          </div>
        </form>
        {filter.actor_user_id ? (
          <p className="fhint">
            {a("byActor", {
              name: names.get(filter.actor_user_id) ?? filter.actor_user_id.slice(0, 8),
            })}
          </p>
        ) : null}
        <div className="card tcard">
          {page.data.length === 0 ? (
            <p className="empty">{a("empty")}</p>
          ) : (
            <Table cards>
              <thead>
                <tr>
                  <SortTh field="when" sort={sort} base={BASE} keep={filterKeep} first="desc">
                    {a("when")}
                  </SortTh>
                  <Th>{a("actor")}</Th>
                  <Th>{a("action")}</Th>
                  <Th>{a("subject")}</Th>
                </tr>
              </thead>
              <tbody>
                {page.data.map((entry) => {
                  const actor = entry.actor_user_id;
                  return (
                    <tr key={entry.id}>
                      <Td className="whitespace-nowrap rt-title">
                        <Link className="open" href={`${BASE}/${entry.id}`}>
                          <Time value={entry.occurred_at} />
                        </Link>
                      </Td>
                      <Td label={a("actor")}>
                        <span className="cell2">
                          {actor ? (
                            <Link
                              href={auditHref(BASE, { ...filter, actor_user_id: actor })}
                              title={a("onlyActor")}
                            >
                              {names.get(actor) ?? actor.slice(0, 8)}
                            </Link>
                          ) : (
                            <span>{a(`kind.${entry.actor_kind}`)}</span>
                          )}
                          <span className="sub">
                            {t.has(`settings.audit.kind.${entry.actor_kind}`)
                              ? a(`kind.${entry.actor_kind}`)
                              : entry.actor_kind}
                            {entry.actor_api_key_id ? ` · ${a("viaKey")}` : ""}
                          </span>
                        </span>
                      </Td>
                      <Td label={a("action")}>
                        <span className="mono">{entry.action}</span>
                      </Td>
                      <Td label={a("subject")}>
                        <span className="mono ell sub-id">{entry.subject ?? "—"}</span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
        <Pager
          first={cursor ? withQuery(BASE, keep) : null}
          next={next ? withQuery(BASE, keep, { cursor: next }) : null}
        />
      </section>
    </div>
  );
}
