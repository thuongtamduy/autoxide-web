"use client";

import type { Problem } from "@autoxide/sdk";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveMenu } from "@/app/(admin)/content/menus/actions";
import { SampleBadge } from "@/components/sample-badge";
import { Icon, type IconName } from "@/components/shell/icon";
import { Labelled } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  addChild,
  BADGE_TONES,
  badgeShown,
  blankItem,
  DEFAULT_AUTO_CHILDREN,
  type FlatItem,
  flatten,
  HIGHLIGHTS,
  type Highlight,
  indent,
  MAX_AUTO_CHILDREN,
  MAX_BADGE,
  MAX_DEPTH,
  MAX_ITEMS,
  MAX_LABEL,
  MENU_ICONS,
  type MenuIcon,
  type MenuRef,
  type MoveResult,
  moveDown,
  moveUp,
  outdent,
  pathOf,
  removeBlock,
  type TargetType,
  targetType,
  toTree,
  urlProblem,
} from "@/lib/menu-tree";
import {
  dayOfUntil,
  fromSaved,
  kindKey,
  type PreviewItem,
  type PublicSiteMenu,
  previewFromDraft,
  previewFromPublic,
  type RefKind,
  type RefObject,
  type SiteMenu,
  serverIssues,
  untilFromDay,
  vnDate,
  vnMidnight,
} from "@/lib/menus";

/** Biểu tượng của core (`icon` của mục) vẽ bằng bộ biểu tượng của khung quản trị. */
const GLYPH: Record<MenuIcon, IconName> = {
  bag: "bag",
  bolt: "bolt",
  book: "book",
  calendar: "calendar",
  cart: "cart",
  category: "category",
  chat: "chat",
  fire: "fire",
  gift: "gift",
  grid: "grid",
  heart: "heart",
  help: "help",
  home: "home",
  info: "info",
  mail: "mail",
  map_pin: "pin",
  news: "posts",
  percent: "percent",
  phone: "phone",
  search: "search",
  shop: "shop",
  sparkles: "spark",
  star: "star",
  store: "store",
  tag: "tag",
  truck: "truck",
  user: "user",
};

interface Issue {
  /** Khoá ổn định của dòng lỗi (cho React). */
  key: string;
  /** Mục bị lỗi; `null` khi lỗi thuộc cả menu (vd quá 200 mục). */
  id: string | null;
  path: string;
  /** Trường của mục (`url`, `ref.id`…) và mã lỗi của core; trống khi giao diện tự kiểm. */
  field: string;
  code: string;
  message: string;
}

type Outcome =
  | { type: "conflict"; detail: string }
  | { type: "issues"; list: Issue[]; server: Problem | null }
  | { type: "error"; problem: Problem }
  | null;

/** Mã lỗi theo trường của core mà giao diện có câu riêng (`menus.editor.codes.*`). */
const FIELD_CODES = ["ref_unknown_kind", "ref_not_found", "children_unsupported", "too_deep"];

/**
 * Trình sửa một menu của module `menus`: cây mục ở dạng phẳng (lên, xuống, thụt vào, kéo ra, thêm
 * mục con, xoá), ngăn sửa mục đang chọn (đích, nhãn, nhóm con tự lấy, biểu tượng, nhãn nổi bật, kiểu
 * nổi bật, ô gợi ý), lưu cả cây với `If-Match`, xem trước bản nháp và menu công khai của core.
 */
export function MenuEditor({
  menu,
  etag: initialEtag,
  kinds,
  objects,
  live,
  now,
}: {
  menu: SiteMenu;
  etag: string;
  kinds: RefKind[];
  objects: RefObject[];
  /** Menu như website đang hiện (`GET /api/v1/menus/public/{key}`); `null` khi không đọc được. */
  live: PublicSiteMenu | null;
  /** Thời điểm của lần dựng trang (RFC 3339), để tính nhãn trong hạn. */
  now: string;
}) {
  const t = useTranslations("menus.editor");
  const toast = useToast();
  const router = useRouter();
  const base = useMemo(() => flatten(fromSaved(menu.items)), [menu.items]);
  const [rows, setRows] = useState<FlatItem[]>(base);
  const [etag, setEtag] = useState(initialEtag);
  const [selected, setSelected] = useState<string | null>(base[0]?.id ?? null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();
  // Bản mới từ máy chủ (sau khi lưu, hoặc "Tải bản mới" khi người khác vừa lưu): nhận cây mới nhưng
  // giữ mục đang chọn và bảng xem trước đang mở, thay vì dựng lại cả trình sửa (React khuyên chỉnh
  // state ngay trong lúc render khi prop đổi, không dùng useEffect). Core cấp id mới cho mọi mục mỗi
  // lần lưu, nên mục đang chọn được giữ theo vị trí trong cây.
  const [seenEtag, setSeenEtag] = useState(initialEtag);
  if (seenEtag !== initialEtag) {
    setSeenEtag(initialEtag);
    setRows(base);
    setEtag(initialEtag);
    if (initialEtag !== etag) setOutcome(null);
    if (!base.some((row) => row.id === selected)) {
      const at = rows.findIndex((row) => row.id === selected);
      setSelected(base[Math.min(Math.max(at, 0), base.length - 1)]?.id ?? null);
    }
  }
  const dirty = JSON.stringify(rows) !== JSON.stringify(base);
  const byId = useMemo(() => new Map(objects.map((o) => [`${o.kind}:${o.id}`, o])), [objects]);
  const objectOf = (ref: MenuRef | null) => (ref ? byId.get(`${ref.kind}:${ref.id}`) : undefined);
  const kindOf = (kind: string | undefined) => kinds.find((k) => k.kind === kind);
  const labelOf = (row: FlatItem) =>
    row.label.trim() ||
    objectOf(row.ref)?.title ||
    (targetType(row) === "group" ? t("unnamedGroup") : t("unnamed"));
  const index = rows.findIndex((row) => row.id === selected);
  const current = index >= 0 ? rows[index] : undefined;

  // Ẩn: mục trỏ tới đối tượng không còn công khai, kèm mọi mục con (như API công khai).
  const hidden = useMemo(() => {
    const out = new Set<string>();
    const stack: { depth: number; hidden: boolean }[] = [];
    for (const row of rows) {
      while (stack.length > 0 && (stack.at(-1)?.depth ?? -1) >= row.depth) stack.pop();
      const object = row.ref ? byId.get(`${row.ref.kind}:${row.ref.id}`) : undefined;
      const gone = Boolean(stack.at(-1)?.hidden) || (object !== undefined && !object.public);
      if (gone) out.add(row.id);
      stack.push({ depth: row.depth, hidden: gone });
    }
    return out;
  }, [rows, byId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const apply = (result: MoveResult) => {
    if (result.ok) {
      setRows(result.rows);
      setOutcome(null);
    } else {
      toast(t(`move.${result.reason}`, { max: MAX_DEPTH }));
    }
  };
  const update = (id: string, change: Partial<FlatItem>) =>
    setRows((list) => list.map((row) => (row.id === id ? { ...row, ...change } : row)));
  const add = (parent: number) => {
    if (rows.length >= MAX_ITEMS) {
      toast(t("tooMany", { max: MAX_ITEMS }));
      return;
    }
    const item = blankItem(crypto.randomUUID(), t("newItem"));
    const result = addChild(rows, parent, item);
    apply(result);
    if (result.ok) {
      setSelected(item.id);
      toast(t("added"));
    }
  };

  // Kiểm trước khi gửi những gì core sẽ kiểm mà không cần hỏi module khác (`items.rs`).
  const localIssues = (): Issue[] =>
    rows.flatMap((row, i) => {
      const path = pathOf(rows, i, labelOf);
      const issue = (field: string, message: string): Issue => ({
        key: `${row.id}:${field}`,
        id: row.id,
        path,
        field,
        code: "",
        message,
      });
      const type = targetType(row);
      const out: Issue[] = [];
      if (type === "url" && row.url !== null) {
        const problem = urlProblem(row.url);
        if (problem) out.push(issue("url", t(`url.${problem}`)));
      }
      if (type !== "ref" && !row.label.trim()) out.push(issue("label", t("labelRequired")));
      if (row.label.trim().length > MAX_LABEL) {
        out.push(issue("label", t("labelTooLong", { max: MAX_LABEL })));
      }
      if (type === "ref" && !row.ref?.id) out.push(issue("ref", t("refRequired")));
      if (row.badge && row.badge.text.trim().length > MAX_BADGE) {
        out.push(issue("badge.text", t("badgeTooLong", { max: MAX_BADGE })));
      }
      if (type === "ref" && row.auto_children) {
        const limit = row.auto_children_limit;
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_AUTO_CHILDREN) {
          out.push(issue("auto_children_limit", t("limitRange", { max: MAX_AUTO_CHILDREN })));
        }
      }
      return out;
    });

  const save = () => {
    const local = localIssues();
    if (local.length > 0) {
      setOutcome({ type: "issues", list: local, server: null });
      setSelected(local[0]?.id ?? selected);
      return;
    }
    const sent = rows;
    start(async () => {
      const result = await saveMenu(menu.id, etag, toTree(sent));
      if (result.ok) {
        setEtag(result.data.etag);
        setOutcome(null);
        toast(t("saved"));
        router.refresh();
        return;
      }
      const problem = result.problem;
      if (problem.code === "precondition_failed") {
        setOutcome({ type: "conflict", detail: problem.detail });
        return;
      }
      if (problem.status === 422 && problem.errors && problem.errors.length > 0) {
        const list = serverIssues(problem, sent).map((issue, n): Issue => {
          const i = issue.id ? sent.findIndex((row) => row.id === issue.id) : -1;
          return {
            key: `server:${n}`,
            id: issue.id,
            path: i >= 0 ? pathOf(sent, i, labelOf) : t("wholeMenu"),
            field: issue.rest,
            code: issue.code,
            message: FIELD_CODES.includes(issue.code)
              ? t(`codes.${issue.code}`, { detail: issue.detail })
              : issue.detail,
          };
        });
        setOutcome({ type: "issues", list, server: problem });
        setSelected(list.find((issue) => issue.id)?.id ?? selected);
        return;
      }
      setOutcome({ type: "error", problem });
    });
  };

  const issueOf = (id: string) =>
    outcome?.type === "issues" ? outcome.list.filter((issue) => issue.id === id) : [];

  return (
    <div className="mn-editor">
      <div className="mn-edhead">
        <span className="mn-edtitle">
          <b>
            {t("editing")} <span className="mono">{menu.key}</span> · {menu.locale.toUpperCase()}
          </b>
          <span className="fhint">
            {t("version", { etag })}
            {dirty ? ` · ${t("dirty")}` : ""}
          </span>
        </span>
        <span className="headacts">
          <button
            type="button"
            className="btn sm"
            disabled={!dirty || pending}
            onClick={() => {
              setRows(base);
              setOutcome(null);
            }}
          >
            {t("discard")}
          </button>
          <button type="button" className="btn sm pri" disabled={!dirty || pending} onClick={save}>
            <Icon name="check" small />
            {t("save")}
          </button>
        </span>
      </div>

      {outcome?.type === "conflict" ? (
        <div role="alert" className="falert mn-alert" data-code="precondition_failed">
          <span>
            <b>{t("conflictTitle")}</b> {t("conflictText")}
          </span>
          <button type="button" className="btn sm" onClick={() => router.refresh()}>
            {t("reload")}
          </button>
        </div>
      ) : null}
      {outcome?.type === "error" ? (
        <p role="alert" className="falert" data-code={outcome.problem.code}>
          {outcome.problem.detail}
        </p>
      ) : null}
      {outcome?.type === "issues" ? (
        <div
          role="alert"
          className="falert mn-alert"
          data-code={outcome.server ? outcome.server.code : "local"}
        >
          <b>
            {outcome.server
              ? outcome.server.detail
              : t("localIssues", { count: outcome.list.length })}
          </b>
          <ul className="mn-issues">
            {outcome.list.map((issue) => (
              <li key={issue.key}>
                {issue.code ? <span className="mono">{issue.code}</span> : null}
                <span>
                  <b>{issue.path}</b>
                  {issue.field ? <span className="mono"> · {issue.field}</span> : null}:{" "}
                  {issue.message}
                </span>
                {issue.id ? (
                  <button
                    type="button"
                    className="btn ghost sm"
                    onClick={() => setSelected(issue.id)}
                  >
                    {t("goTo")}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mn-grid">
        <section className="card mn-tree" aria-labelledby="mn-tree-h">
          <div className="block-head">
            <h3 id="mn-tree-h" className="h2">
              {t("tree")}
            </h3>
            <span className="fhint num">
              {t("count", { count: rows.length, max: MAX_ITEMS, depth: MAX_DEPTH })}
            </span>
            <button type="button" className="btn sm" onClick={() => add(-1)}>
              <Icon name="plus" small />
              {t("add")}
            </button>
          </div>
          <p className="fhint">{t("treeHint")}</p>
          {rows.length === 0 ? <p className="empty">{t("empty")}</p> : null}
          <ol className="mn-rows">
            {rows.map((row, i) => {
              const object = objectOf(row.ref);
              const kind = kindOf(row.ref?.kind);
              const on = row.id === selected;
              const bad = issueOf(row.id).length > 0;
              const type = targetType(row);
              return (
                <li
                  key={row.id}
                  className={["mn-row", on ? "on" : "", bad ? "bad" : ""].join(" ")}
                  style={{ marginInlineStart: `${row.depth * 22}px` }}
                >
                  <button
                    type="button"
                    className="mn-rowbtn"
                    aria-pressed={on}
                    onClick={() => setSelected(row.id)}
                  >
                    <span className="sq-ic">
                      <Icon
                        name={row.icon ? GLYPH[row.icon] : type === "group" ? "menu" : "link"}
                        small
                      />
                    </span>
                    <span className="mn-rowmain">
                      <span className={hidden.has(row.id) ? "mn-label gone" : "mn-label"}>
                        {labelOf(row)}
                      </span>
                      <span className="fhint ell">
                        {type === "group"
                          ? t("group")
                          : type === "url"
                            ? row.url
                            : `${kindName(t, row.ref?.kind)} · ${object?.hint ?? row.ref?.id ?? ""}`}
                      </span>
                      {row.auto_children && object && object.children.length > 0 ? (
                        <span className="fhint ell">
                          ↳{" "}
                          {t("autoLine", {
                            list: object.children.slice(0, row.auto_children_limit).join(", "),
                          })}
                        </span>
                      ) : null}
                    </span>
                    <span className="mn-badges">
                      {row.badge && badgeShown(row.badge, now) ? (
                        <span className={`mn-badge t-${row.badge.tone}`}>{row.badge.text}</span>
                      ) : null}
                      {row.auto_children ? (
                        <span className="badge b-info">
                          {t("auto", { limit: row.auto_children_limit })}
                        </span>
                      ) : null}
                      {row.feature ? <span className="badge b-info">{t("hasFeature")}</span> : null}
                      {kind?.step || object?.sample ? (
                        <span className="badge b-sample">{t("sampleTarget")}</span>
                      ) : null}
                      {hidden.has(row.id) ? (
                        <span className="badge b-warn">{t("willHide")}</span>
                      ) : null}
                      {bad ? <span className="badge b-bad">{t("hasError")}</span> : null}
                    </span>
                  </button>
                  {on ? (
                    <span className="mn-rowacts">
                      <button
                        type="button"
                        className="btn sm sq"
                        aria-label={t("up")}
                        title={t("up")}
                        onClick={() => apply(moveUp(rows, i))}
                      >
                        <Icon name="up" small />
                      </button>
                      <button
                        type="button"
                        className="btn sm sq"
                        aria-label={t("down")}
                        title={t("down")}
                        onClick={() => apply(moveDown(rows, i))}
                      >
                        <Icon name="chev" small />
                      </button>
                      <button
                        type="button"
                        className="btn sm sq"
                        aria-label={t("outdent")}
                        title={t("outdent")}
                        onClick={() => apply(outdent(rows, i))}
                      >
                        <Icon name="outdent" small />
                      </button>
                      <button
                        type="button"
                        className="btn sm sq"
                        aria-label={t("indent")}
                        title={t("indent")}
                        onClick={() => apply(indent(rows, i))}
                      >
                        <Icon name="indent" small />
                      </button>
                      <button type="button" className="btn sm" onClick={() => add(i)}>
                        <Icon name="plus" small />
                        {t("addChild")}
                      </button>
                      <button
                        type="button"
                        className="btn sm danger"
                        aria-label={t("remove")}
                        onClick={() => {
                          setRows(removeBlock(rows, i));
                          setSelected(rows[i - 1]?.id ?? null);
                          toast(t("removed"));
                        }}
                      >
                        <Icon name="trash" small />
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </section>

        <section className="card mn-panel" aria-labelledby="mn-item-h">
          <h3 id="mn-item-h" className="cap">
            {t("itemTitle")}
          </h3>
          {current ? (
            <ItemForm
              key={current.id}
              row={current}
              path={pathOf(rows, index, labelOf)}
              issues={issueOf(current.id)}
              kinds={kinds}
              objects={objects}
              now={now}
              update={(change) => update(current.id, change)}
            />
          ) : (
            <p className="fhint">{t("choose")}</p>
          )}
        </section>
      </div>

      <StorefrontPreview
        draft={previewFromDraft(rows, hidden, byId, labelOf, now)}
        hiddenCount={hidden.size}
        live={live ? previewFromPublic(live.items) : null}
        liveLocale={live?.locale ?? null}
      />
    </div>
  );
}

type T = ReturnType<typeof useTranslations<"menus.editor">>;

function kindName(t: T, kind: string | undefined): string {
  const key = `kinds.${kindKey(kind ?? "unknown")}`;
  return t.has(key) ? t(key) : (kind ?? t("kinds.unknown"));
}

/** Ngăn sửa mục đang chọn. Đổi ở đây là đổi bản nháp; bấm "Lưu menu" mới gửi. */
function ItemForm({
  row,
  path,
  issues,
  kinds,
  objects,
  now,
  update,
}: {
  row: FlatItem;
  path: string;
  issues: Issue[];
  kinds: RefKind[];
  objects: RefObject[];
  now: string;
  update: (change: Partial<FlatItem>) => void;
}) {
  const t = useTranslations("menus.editor");
  const [search, setSearch] = useState("");
  const type = targetType(row);
  const kind = kinds.find((k) => k.kind === row.ref?.kind);
  const object = objects.find((o) => o.kind === row.ref?.kind && o.id === row.ref?.id);
  const feature = objects.find((o) => o.kind === row.feature?.kind && o.id === row.feature?.id);
  const urlIssue = type === "url" && row.url !== null ? urlProblem(row.url) : null;
  // Mục ở cấp 4 không tự lấy nhóm con được: nhóm con sẽ vượt 4 cấp.
  const autoAllowed = type === "ref" && Boolean(kind?.tree) && row.depth < MAX_DEPTH - 1;
  const setType = (next: TargetType) => {
    if (next === type) return;
    if (next === "url") update({ url: "/", ref: null, auto_children: false });
    if (next === "group") update({ url: null, ref: null, auto_children: false });
    if (next === "ref") update({ url: null, ref: { kind: kinds[0]?.kind ?? "", id: "" } });
  };
  const needle = search.trim().toLowerCase();
  const choices = objects.filter(
    (o) =>
      o.kind === row.ref?.kind &&
      (!needle || `${o.title} ${o.hint}`.toLowerCase().includes(needle) || o.id === row.ref?.id),
  );
  const badge = row.badge ?? { text: "", tone: "neutral" as const, from: null, until: null };
  const setBadge = (change: Partial<typeof badge>) => {
    const next = { ...badge, ...change };
    update({ badge: next.text || next.from || next.until ? next : null });
  };
  return (
    <div className="mn-form">
      <span className="fhint">{path}</span>
      {issues.map((issue) => (
        <p key={issue.key} className="ferr" role="alert">
          {issue.code ? <span className="mono">{issue.code} </span> : null}
          {issue.field ? <span className="mono">{issue.field}: </span> : null}
          {issue.message}
        </p>
      ))}

      <fieldset className="mn-fs">
        <legend className="lab">{t("target")}</legend>
        <span className="seg">
          {(["url", "ref", "group"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={type === value}
              className={type === value ? "on" : ""}
              onClick={() => setType(value)}
            >
              {t(`targets.${value}`)}
            </button>
          ))}
        </span>
        {type === "url" ? (
          <Labelled
            label={t("url.label")}
            error={urlIssue ? t(`url.${urlIssue}`) : undefined}
            hint={urlIssue ? undefined : t("url.ok")}
          >
            {(id, aria) => (
              <input
                id={id}
                className="inp mono"
                value={row.url ?? ""}
                {...aria}
                onChange={(event) => update({ url: event.target.value })}
              />
            )}
          </Labelled>
        ) : null}
        {type === "ref" ? (
          <>
            <Labelled
              label={t("kind")}
              hint={kind?.step ? t("kindStep", { step: kind.step }) : t("kindCore")}
            >
              {(id, aria) => (
                <select
                  id={id}
                  className="inp"
                  value={row.ref?.kind ?? ""}
                  {...aria}
                  onChange={(event) =>
                    update({ ref: { kind: event.target.value, id: "" }, auto_children: false })
                  }
                >
                  {kinds.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {kindName(t, k.kind)} · {k.kind}
                      {k.step ? ` · ${t("sampleKind", { step: k.step })}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </Labelled>
            {kind?.step ? (
              <span className="mn-sample">
                <SampleBadge
                  step={kind.step}
                  endpoint={`${kind.kind} (GET /api/v1/kernel/resources)`}
                />
              </span>
            ) : null}
            <label className="fld">
              <span className="lab">{t("find")}</span>
              <input
                className="inp"
                type="search"
                value={search}
                placeholder={t("findPlaceholder")}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="fld">
              <span className="lab">{t("object")}</span>
              <select
                className="inp"
                value={row.ref?.id ?? ""}
                onChange={(event) =>
                  update({ ref: { kind: row.ref?.kind ?? "", id: event.target.value } })
                }
              >
                <option value="">{t("chooseObject")}</option>
                {row.ref?.id && !object ? (
                  <option value={row.ref.id}>{t("unknownObject", { id: row.ref.id })}</option>
                ) : null}
                {choices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title || o.id}
                    {o.public ? "" : ` · ${t("notPublic")}`}
                  </option>
                ))}
              </select>
            </label>
            {object ? <ObjectCard object={object} /> : null}
            <p className="fhint">{kind?.step ? t("refSampleHint") : t("refHint")}</p>
          </>
        ) : null}
        {type === "group" ? <p className="fhint">{t("groupHint")}</p> : null}
      </fieldset>

      <Labelled label={t("label")} hint={type === "ref" ? t("labelFromObject") : t("labelHint")}>
        {(id, aria) => (
          <input
            id={id}
            className="inp"
            value={row.label}
            maxLength={MAX_LABEL}
            placeholder={object?.title ?? ""}
            {...aria}
            onChange={(event) => update({ label: event.target.value })}
          />
        )}
      </Labelled>

      <div className="mn-fs">
        <label className="check">
          <input
            type="checkbox"
            checked={row.auto_children}
            disabled={!autoAllowed && !row.auto_children}
            onChange={(event) =>
              update({
                auto_children: event.target.checked,
                auto_children_limit: row.auto_children_limit || DEFAULT_AUTO_CHILDREN,
              })
            }
          />
          <span className="check-main">
            <span className="check-name">{t("autoChildren")}</span>
            <span className="check-desc">
              {autoAllowed ? t("autoHint") : t("autoUnsupported", { max: MAX_DEPTH })}
            </span>
          </span>
        </label>
        {row.auto_children ? (
          <label className="fld mn-inline">
            <span className="lab">{t("limit")}</span>
            <input
              className="inp num"
              type="number"
              min={1}
              max={MAX_AUTO_CHILDREN}
              value={row.auto_children_limit}
              onChange={(event) => update({ auto_children_limit: Number(event.target.value) })}
            />
          </label>
        ) : null}
      </div>

      <fieldset className="mn-fs">
        <legend className="lab">{t("icon")}</legend>
        <span className="mn-icons">
          {([null, ...MENU_ICONS] as (MenuIcon | null)[]).map((icon) => (
            <button
              key={icon ?? "none"}
              type="button"
              aria-pressed={row.icon === icon}
              aria-label={icon ?? t("noIcon")}
              title={icon ?? t("noIcon")}
              className={row.icon === icon ? "btn sm sq on" : "btn sm sq"}
              onClick={() => update({ icon })}
            >
              <Icon name={icon ? GLYPH[icon] : "x"} small />
            </button>
          ))}
        </span>
      </fieldset>

      <fieldset className="mn-fs">
        <legend className="lab">{t("badge")}</legend>
        <input
          className="inp"
          value={badge.text}
          maxLength={MAX_BADGE}
          placeholder={t("badgePlaceholder")}
          aria-label={t("badge")}
          onChange={(event) => setBadge({ text: event.target.value })}
        />
        {row.badge ? (
          <>
            <label className="fld">
              <span className="lab">{t("tone")}</span>
              <select
                className="inp"
                value={badge.tone}
                onChange={(event) =>
                  setBadge({ tone: event.target.value as (typeof BADGE_TONES)[number] })
                }
              >
                {BADGE_TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {t(`tones.${tone}`)}
                  </option>
                ))}
              </select>
            </label>
            <span className="fld-row">
              <label className="fld">
                <span className="lab">{t("from")}</span>
                <input
                  className="inp"
                  type="date"
                  value={badge.from ? vnDate(badge.from) : ""}
                  onChange={(event) =>
                    setBadge({ from: event.target.value ? vnMidnight(event.target.value) : null })
                  }
                />
              </label>
              <label className="fld">
                <span className="lab">{t("until")}</span>
                <input
                  className="inp"
                  type="date"
                  value={badge.until ? dayOfUntil(badge.until) : ""}
                  onChange={(event) =>
                    setBadge({
                      until: event.target.value ? untilFromDay(event.target.value) : null,
                    })
                  }
                />
              </label>
            </span>
            <span className="fhint">
              {badgeShown(row.badge, now) ? t("badgeOn") : t("badgeOff")} {t("badgeZone")}
            </span>
          </>
        ) : null}
      </fieldset>

      <Labelled label={t("highlight")} hint={t("highlightHint")}>
        {(id, aria) => (
          <select
            id={id}
            className="inp"
            value={row.highlight ?? ""}
            {...aria}
            onChange={(event) =>
              update({ highlight: (event.target.value || null) as Highlight | null })
            }
          >
            <option value="">{t("highlights.none")}</option>
            {HIGHLIGHTS.map((value) => (
              <option key={value} value={value}>
                {t(`highlights.${value}`)}
              </option>
            ))}
          </select>
        )}
      </Labelled>

      <fieldset className="mn-fs">
        <legend className="lab">{t("feature")}</legend>
        <select
          className="inp"
          aria-label={t("feature")}
          value={row.feature ? `${row.feature.kind}|${row.feature.id}` : ""}
          onChange={(event) => {
            const [k, id] = event.target.value.split("|");
            update({ feature: k && id ? { kind: k, id } : null });
          }}
        >
          <option value="">{t("noFeature")}</option>
          {row.feature && !feature ? (
            <option value={`${row.feature.kind}|${row.feature.id}`}>
              {t("unknownObject", { id: row.feature.id })}
            </option>
          ) : null}
          {objects
            .filter((o) => !kinds.find((k) => k.kind === o.kind)?.tree)
            .map((o) => (
              <option key={`${o.kind}|${o.id}`} value={`${o.kind}|${o.id}`}>
                {kindName(t, o.kind)} · {o.title || o.id}
                {o.sample ? ` · ${t("sampleTarget")}` : ""}
              </option>
            ))}
        </select>
        {feature ? <ObjectCard object={feature} /> : null}
        <span className="fhint">{t("featureHint")}</span>
      </fieldset>
    </div>
  );
}

function ObjectCard({ object }: { object: RefObject }) {
  const t = useTranslations("menus.editor");
  return (
    <span className="mn-obj">
      <span className="fhint mono">
        {object.kind}
        {object.sample ? ` · ${t("sampleTarget")}` : ""}
      </span>
      <b>{object.title || object.id}</b>
      <span className="mono fhint ell">{object.hint}</span>
      <span className={object.public ? "badge b-ok" : "badge b-warn"}>
        <span className="dot" />
        {object.public ? t("public") : t("willHide")}
      </span>
    </span>
  );
}

/**
 * Xem trước mặt tiền: "Bản nháp" dựng từ bản chưa lưu theo luật của menu công khai; "Đang hiện" là
 * câu trả lời thật của `GET /api/v1/menus/public/{key}` cho bản đã lưu. Bấm một mục của thanh danh
 * mục để mở bảng xổ của nó.
 */
function StorefrontPreview({
  draft,
  hiddenCount,
  live,
  liveLocale,
}: {
  draft: PreviewItem[];
  hiddenCount: number;
  live: PreviewItem[] | null;
  liveLocale: string | null;
}) {
  const t = useTranslations("menus.preview");
  const [source, setSource] = useState<"draft" | "live">("draft");
  // Giữ theo vị trí: sau khi lưu, core cấp id mới cho mọi mục.
  const [open, setOpen] = useState<number | null>(null);
  const tree = source === "draft" ? draft : (live ?? []);
  const top = open === null ? null : (tree[open] ?? null);
  // Lối vào đặc biệt (accent, brand, sale) dồn phải; `muted` ở lại bên trái, màu nhạt.
  const pushed = (item: PreviewItem) => item.highlight !== null && item.highlight !== "muted";
  const ordered = [
    ...tree.map((item, i) => ({ item, i })).filter(({ item }) => !pushed(item)),
    ...tree.map((item, i) => ({ item, i })).filter(({ item }) => pushed(item)),
  ];
  const firstRight = ordered.find(({ item }) => pushed(item))?.i;
  return (
    <section className="block mn-preview" aria-labelledby="mn-pv-h">
      <div className="block-head">
        <h3 id="mn-pv-h" className="h2">
          {t("title")}
        </h3>
        <span className="seg">
          {(["draft", "live"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={source === value}
              className={source === value ? "on" : ""}
              onClick={() => {
                setSource(value);
                setOpen(null);
              }}
            >
              {t(`sources.${value}`)}
            </button>
          ))}
        </span>
      </div>
      <p className="fhint">
        {source === "draft" ? t("about") : t("aboutLive", { locale: liveLocale ?? "" })}
      </p>
      {source === "draft" && hiddenCount > 0 ? (
        <p className="note warn">{t("hidden", { count: hiddenCount })}</p>
      ) : null}
      {source === "live" && live === null ? (
        <p className="note warn">{t("liveMissing")}</p>
      ) : (
        <div className="card mn-store">
          <nav className="mn-bar" aria-label={t("bar")}>
            {ordered.map(({ item, i }) => (
              <button
                key={item.key}
                type="button"
                className={[
                  "mn-baritem",
                  item.highlight ? `hl-${item.highlight}` : "",
                  i === open ? "on" : "",
                  i === firstRight ? "push" : "",
                ].join(" ")}
                aria-expanded={i === open}
                onClick={() => setOpen(i === open ? null : i)}
              >
                {item.icon ? <Icon name={GLYPH[item.icon]} small /> : null}
                {item.label}
                {item.badge ? (
                  <span className={`mn-badge t-${item.badge.tone}`}>{item.badge.text}</span>
                ) : null}
              </button>
            ))}
          </nav>
          {top ? (
            <div className="mn-mega">
              {top.children.length === 0 && top.auto.length === 0 && !top.feature ? (
                <p className="fhint">{t("noMega")}</p>
              ) : null}
              {top.auto.length > 0 ? (
                <div className="mn-col">
                  <span className="cap">{t("groups")}</span>
                  {top.auto.map((name) => (
                    <span key={name}>{name}</span>
                  ))}
                </div>
              ) : null}
              {top.children.map((child) => (
                <div key={child.key} className="mn-col">
                  <span className="cap">{child.label}</span>
                  {child.children.map((leaf) => (
                    <span key={leaf.key}>{leaf.label}</span>
                  ))}
                  {child.auto.map((name) => (
                    <span key={`auto:${name}`}>{name}</span>
                  ))}
                </div>
              ))}
              {top.feature ? (
                <div className="mn-feature">
                  <span className="cap">{t("feature")}</span>
                  <b>{top.feature.title}</b>
                  <span className="fhint">{top.feature.summary}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="fhint mn-tap">{t("tap")}</p>
          )}
        </div>
      )}
    </section>
  );
}
