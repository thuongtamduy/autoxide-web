"use client";

import type { Problem } from "@autoxide/sdk";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { otherPersonSaves, saveMenu } from "@/app/(admin)/content/menus/actions";
import { Icon, type IconName } from "@/components/shell/icon";
import { Labelled } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import {
  addChild,
  BADGE_TONES,
  badgeShown,
  blankItem,
  type FlatItem,
  flatten,
  HIGHLIGHTS,
  indent,
  MAX_DEPTH,
  MAX_ITEMS,
  MENU_ICONS,
  type MenuIcon,
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
import type { Menu, RefKind, RefObject } from "@/sample/menus";

interface Issue {
  id: string;
  path: string;
  code: string;
  message: string;
}

type Outcome =
  | { type: "conflict" }
  | { type: "issues"; list: Issue[]; server: boolean }
  | { type: "error"; problem: Problem }
  | null;

/**
 * Trình sửa một menu (dữ liệu mẫu, chờ module `menus`): cây mục ở dạng phẳng (lên, xuống, thụt vào,
 * kéo ra, thêm mục con, xoá), ngăn sửa mục đang chọn (đích, nhãn, nhóm con tự lấy, biểu tượng, nhãn
 * có hạn, kiểu nổi bật, ô Gợi ý), lưu cả cây với `If-Match`, và xem trước mặt tiền theo bản nháp.
 */
export function MenuEditor({
  menu,
  etag: initialEtag,
  kinds,
  objects,
  today,
}: {
  menu: Menu;
  etag: string;
  kinds: RefKind[];
  objects: RefObject[];
  /** Ngày hôm nay (UTC, `YYYY-MM-DD`) để tính nhãn có hạn. */
  today: string;
}) {
  const t = useTranslations("menus.editor");
  const toast = useToast();
  const router = useRouter();
  const base = useMemo(() => flatten(menu.items), [menu.items]);
  const [rows, setRows] = useState<FlatItem[]>(base);
  const [etag, setEtag] = useState(initialEtag);
  const [selected, setSelected] = useState<string | null>(base[0]?.id ?? null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [pending, start] = useTransition();
  // Bản mới từ máy chủ (sau khi lưu, hoặc "Tải bản mới" khi người khác vừa lưu): nhận cây mới nhưng
  // giữ mục đang chọn và bảng xem trước đang mở, thay vì dựng lại cả trình sửa (React khuyên chỉnh
  // state ngay trong lúc render khi prop đổi, không dùng useEffect).
  const [seenEtag, setSeenEtag] = useState(initialEtag);
  if (seenEtag !== initialEtag) {
    setSeenEtag(initialEtag);
    setRows(base);
    setEtag(initialEtag);
    if (initialEtag !== etag) setOutcome(null);
    if (!base.some((row) => row.id === selected)) setSelected(base[0]?.id ?? null);
  }
  const dirty = JSON.stringify(rows) !== JSON.stringify(base);
  const byId = useMemo(() => new Map(objects.map((o) => [`${o.kind}:${o.id}`, o])), [objects]);
  const kindOf = (kind: string | null) => kinds.find((k) => k.kind === kind);
  const objectOf = (kind: string | null, id: string | null) =>
    kind && id ? byId.get(`${kind}:${id}`) : undefined;
  const labelOf = (row: FlatItem) =>
    row.label.trim() ||
    objectOf(row.ref_kind, row.ref_id)?.title ||
    (targetType(row) === "group" ? t("unnamedGroup") : t("unnamed"));
  const index = rows.findIndex((row) => row.id === selected);
  const current = index >= 0 ? rows[index] : undefined;

  // Ẩn: mục trỏ tới đối tượng không còn công khai, kèm mọi mục con (như API công khai).
  const hidden = useMemo(() => {
    const out = new Set<string>();
    const stack: { depth: number; hidden: boolean }[] = [];
    for (const row of rows) {
      while (stack.length > 0 && (stack.at(-1)?.depth ?? -1) >= row.depth) stack.pop();
      const object =
        row.ref_kind && row.ref_id ? byId.get(`${row.ref_kind}:${row.ref_id}`) : undefined;
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
  const newId = () => crypto.randomUUID();
  const add = (parent: number) => {
    if (rows.length >= MAX_ITEMS) {
      toast(t("tooMany", { max: MAX_ITEMS }));
      return;
    }
    const item = blankItem(newId(), t("newItem"));
    const result = addChild(rows, parent, item);
    apply(result);
    if (result.ok) {
      setSelected(item.id);
      toast(t("added"));
    }
  };

  const localIssues = (): Issue[] =>
    rows.flatMap((row, i) => {
      const path = pathOf(rows, i, labelOf);
      const type = targetType(row);
      if (type === "url" && row.url !== null) {
        const problem = urlProblem(row.url);
        if (problem) return [{ id: row.id, path, code: "", message: t(`url.${problem}`) }];
      }
      if (type !== "ref" && !row.label.trim()) {
        return [{ id: row.id, path, code: "", message: t("labelRequired") }];
      }
      if (type === "ref" && !row.ref_id) {
        return [{ id: row.id, path, code: "", message: t("refRequired") }];
      }
      return [];
    });

  const save = () => {
    const local = localIssues();
    if (local.length > 0) {
      setOutcome({ type: "issues", list: local, server: false });
      setSelected(local[0]?.id ?? selected);
      return;
    }
    start(async () => {
      const result = await saveMenu(menu.id, etag, toTree(rows));
      if (result.ok) {
        setEtag(result.data.etag);
        setOutcome(null);
        toast(t("saved", { version: result.data.menu.version }));
        router.refresh();
        return;
      }
      if (result.problem.code === "precondition_failed") {
        setOutcome({ type: "conflict" });
        return;
      }
      if (result.problem.status === 422 && result.problem.errors) {
        const list = result.problem.errors.map((error) => {
          const id = error.field.split(".")[1] ?? "";
          const i = rows.findIndex((row) => row.id === id);
          return {
            id,
            path: i >= 0 ? pathOf(rows, i, labelOf) : error.field,
            code: error.code,
            message: t.has(`codes.${error.code.replace(".", "_")}`)
              ? t(`codes.${error.code.replace(".", "_")}`, { detail: error.detail })
              : error.detail,
          };
        });
        setOutcome({ type: "issues", list, server: true });
        setSelected(list[0]?.id ?? selected);
        return;
      }
      setOutcome({ type: "error", problem: result.problem });
    });
  };

  const issueOf = (id: string) =>
    outcome?.type === "issues" ? outcome.list.find((issue) => issue.id === id) : undefined;

  return (
    <div className="mn-editor">
      <div className="mn-edhead">
        <span className="mn-edtitle">
          <b>
            {t("editing")} <span className="mono">{menu.key}</span>
          </b>
          <span className="fhint">
            {t("version", { version: menu.version, by: menu.updated_by, etag })}
            {dirty ? ` · ${t("dirty")}` : ""}
          </span>
        </span>
        <span className="headacts">
          <button
            type="button"
            className="btn sm"
            disabled={pending}
            title={t("simulateHint")}
            onClick={() =>
              start(async () => {
                const result = await otherPersonSaves(menu.id);
                if (result.ok) toast(t("simulated", { version: result.data.version }));
              })
            }
          >
            {t("simulate")}
          </button>
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
          data-code={outcome.server ? "validation_failed" : "local"}
        >
          <b>
            {t(outcome.server ? "serverIssues" : "localIssues", { count: outcome.list.length })}
          </b>
          <ul className="mn-issues">
            {outcome.list.map((issue) => (
              <li key={`${issue.id}-${issue.code}-${issue.message}`}>
                {issue.code ? <span className="mono">{issue.code}</span> : null}
                <span>
                  <b>{issue.path}</b>: {issue.message}
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => setSelected(issue.id)}
                >
                  {t("goTo")}
                </button>
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
              const object = objectOf(row.ref_kind, row.ref_id);
              const kind = kindOf(row.ref_kind);
              const on = row.id === selected;
              const issue = issueOf(row.id);
              return (
                <li
                  key={row.id}
                  className={["mn-row", on ? "on" : "", issue ? "bad" : ""].join(" ")}
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
                        name={
                          (row.icon ?? (targetType(row) === "group" ? "menu" : "link")) as IconName
                        }
                        small
                      />
                    </span>
                    <span className="mn-rowmain">
                      <span className={hidden.has(row.id) ? "mn-label gone" : "mn-label"}>
                        {labelOf(row)}
                      </span>
                      <span className="fhint ell">
                        {targetType(row) === "group"
                          ? t("group")
                          : targetType(row) === "url"
                            ? row.url
                            : `${t(`kinds.${(kind?.kind ?? "unknown").replace(".", "_")}`)} · ${object?.path ?? row.ref_id}`}
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
                      {badgeShown(row, today) ? (
                        <span className={`mn-badge t-${row.badge_tone}`}>{row.badge_text}</span>
                      ) : null}
                      {row.auto_children ? (
                        <span className="badge b-info">
                          {t("auto", { limit: row.auto_children_limit })}
                        </span>
                      ) : null}
                      {row.feature_id ? (
                        <span className="badge b-sample">{t("hasFeature")}</span>
                      ) : null}
                      {hidden.has(row.id) ? (
                        <span className="badge b-warn">{t("willHide")}</span>
                      ) : null}
                      {issue ? <span className="badge b-bad">{t("hasError")}</span> : null}
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
              issue={issueOf(current.id)}
              kinds={kinds}
              objects={objects}
              today={today}
              update={(change) => update(current.id, change)}
            />
          ) : (
            <p className="fhint">{t("choose")}</p>
          )}
        </section>
      </div>

      <StorefrontPreview
        rows={rows}
        hidden={hidden}
        labelOf={labelOf}
        objects={objects}
        today={today}
      />
    </div>
  );
}

/** Ngăn sửa mục đang chọn. Đổi ở đây là đổi bản nháp; bấm "Lưu menu" mới gửi. */
function ItemForm({
  row,
  path,
  issue,
  kinds,
  objects,
  today,
  update,
}: {
  row: FlatItem;
  path: string;
  issue: Issue | undefined;
  kinds: RefKind[];
  objects: RefObject[];
  today: string;
  update: (change: Partial<FlatItem>) => void;
}) {
  const t = useTranslations("menus.editor");
  const type = targetType(row);
  const kind = kinds.find((k) => k.kind === row.ref_kind);
  const object = objects.find((o) => o.kind === row.ref_kind && o.id === row.ref_id);
  const feature = objects.find((o) => o.kind === row.feature_kind && o.id === row.feature_id);
  const urlIssue = type === "url" && row.url !== null ? urlProblem(row.url) : null;
  const setType = (next: TargetType) => {
    if (next === type) return;
    if (next === "url") update({ url: "/", ref_kind: null, ref_id: null, auto_children: false });
    if (next === "group") update({ url: null, ref_kind: null, ref_id: null, auto_children: false });
    if (next === "ref") {
      const first = kinds[0];
      update({ url: null, ref_kind: first?.kind ?? null, ref_id: null });
    }
  };
  return (
    <div className="mn-form">
      <span className="fhint">{path}</span>
      {issue ? (
        <p className="ferr" role="alert">
          {issue.code ? <span className="mono">{issue.code} </span> : null}
          {issue.message}
        </p>
      ) : null}

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
              hint={kind?.step ? t("kindStep", { step: kind.step }) : undefined}
            >
              {(id, aria) => (
                <select
                  id={id}
                  className="inp"
                  value={row.ref_kind ?? ""}
                  {...aria}
                  onChange={(event) =>
                    update({ ref_kind: event.target.value, ref_id: null, auto_children: false })
                  }
                >
                  {kinds.map((k) => (
                    <option key={k.kind} value={k.kind}>
                      {t(`kinds.${k.kind.replace(".", "_")}`)} · {k.kind}
                    </option>
                  ))}
                </select>
              )}
            </Labelled>
            <label className="fld">
              <span className="lab">{t("object")}</span>
              <select
                className="inp"
                value={row.ref_id ?? ""}
                onChange={(event) => update({ ref_id: event.target.value || null })}
              >
                <option value="">{t("chooseObject")}</option>
                {objects
                  .filter((o) => o.kind === row.ref_kind)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                      {o.public ? "" : ` · ${t("notPublic")}`}
                    </option>
                  ))}
              </select>
            </label>
            {object ? <ObjectCard object={object} /> : null}
            <p className="fhint">{t("refHint")}</p>
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
            maxLength={200}
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
            disabled={type !== "ref" || !kind?.tree}
            onChange={(event) => update({ auto_children: event.target.checked })}
          />
          <span className="check-main">
            <span className="check-name">{t("autoChildren")}</span>
            <span className="check-desc">
              {type === "ref" && kind?.tree ? t("autoHint") : t("autoUnsupported")}
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
              max={24}
              value={row.auto_children_limit}
              onChange={(event) => update({ auto_children_limit: Number(event.target.value) || 1 })}
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
              {icon ? <Icon name={icon} small /> : <Icon name="x" small />}
            </button>
          ))}
        </span>
      </fieldset>

      <fieldset className="mn-fs">
        <legend className="lab">{t("badge")}</legend>
        <input
          className="inp"
          value={row.badge_text}
          maxLength={40}
          placeholder={t("badgePlaceholder")}
          aria-label={t("badge")}
          onChange={(event) => update({ badge_text: event.target.value })}
        />
        {row.badge_text ? (
          <>
            <label className="fld">
              <span className="lab">{t("tone")}</span>
              <select
                className="inp"
                value={row.badge_tone}
                onChange={(event) =>
                  update({ badge_tone: event.target.value as FlatItem["badge_tone"] })
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
                  value={row.badge_from ?? ""}
                  onChange={(event) => update({ badge_from: event.target.value || null })}
                />
              </label>
              <label className="fld">
                <span className="lab">{t("until")}</span>
                <input
                  className="inp"
                  type="date"
                  value={row.badge_until ?? ""}
                  onChange={(event) => update({ badge_until: event.target.value || null })}
                />
              </label>
            </span>
            <span className="fhint">{badgeShown(row, today) ? t("badgeOn") : t("badgeOff")}</span>
          </>
        ) : null}
      </fieldset>

      <Labelled label={t("highlight")} hint={t("highlightHint")}>
        {(id, aria) => (
          <select
            id={id}
            className="inp"
            value={row.highlight}
            {...aria}
            onChange={(event) => update({ highlight: event.target.value as FlatItem["highlight"] })}
          >
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
          value={row.feature_id ? `${row.feature_kind}|${row.feature_id}` : ""}
          onChange={(event) => {
            const [k, id] = event.target.value.split("|");
            update({ feature_kind: id ? (k ?? null) : null, feature_id: id ?? null });
          }}
        >
          <option value="">{t("noFeature")}</option>
          {objects
            .filter((o) => !kinds.find((k) => k.kind === o.kind)?.tree)
            .map((o) => (
              <option key={`${o.kind}|${o.id}`} value={`${o.kind}|${o.id}`}>
                {t(`kinds.${o.kind.replace(".", "_")}`)} · {o.title}
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
      <span className="fhint mono">{object.kind}</span>
      <b>{object.title}</b>
      <span className="mono fhint ell">{object.path}</span>
      <span className={object.public ? "badge b-ok" : "badge b-warn"}>
        <span className="dot" />
        {object.public ? t("public") : `${t("willHide")}${object.note ? ` · ${object.note}` : ""}`}
      </span>
    </span>
  );
}

/** Xem trước mặt tiền theo bản nháp chưa lưu: thanh danh mục, bấm một mục để mở bảng xổ của nó. */
function StorefrontPreview({
  rows,
  hidden,
  labelOf,
  objects,
  today,
}: {
  rows: FlatItem[];
  hidden: Set<string>;
  labelOf: (row: FlatItem) => string;
  objects: RefObject[];
  today: string;
}) {
  const t = useTranslations("menus.preview");
  const tree = toTree(rows.filter((row) => !hidden.has(row.id)));
  const [open, setOpen] = useState<string | null>(null);
  const top = tree.find((item) => item.id === open) ?? null;
  const flatLabel = (item: (typeof tree)[number]) => labelOf({ ...item, depth: 0 } as FlatItem);
  const objectOf = (kind: string | null, id: string | null) =>
    objects.find((o) => o.kind === kind && o.id === id);
  const left = tree.filter((item) => item.highlight === "none");
  const right = tree.filter((item) => item.highlight !== "none");
  const feature = top ? objectOf(top.feature_kind, top.feature_id) : undefined;
  const auto = top?.auto_children
    ? (objectOf(top.ref_kind, top.ref_id)?.children ?? []).slice(0, top.auto_children_limit)
    : [];
  return (
    <section className="block mn-preview" aria-labelledby="mn-pv-h">
      <div className="block-head">
        <h3 id="mn-pv-h" className="h2">
          {t("title")}
        </h3>
      </div>
      <p className="fhint">{t("about")}</p>
      {hidden.size > 0 ? <p className="note warn">{t("hidden", { count: hidden.size })}</p> : null}
      <div className="card mn-store">
        <nav className="mn-bar" aria-label={t("bar")}>
          {[...left, ...right].map((item) => (
            <button
              key={item.id}
              type="button"
              className={[
                "mn-baritem",
                item.highlight !== "none" ? `hl-${item.highlight}` : "",
                item.id === open ? "on" : "",
                item === right[0] ? "push" : "",
              ].join(" ")}
              aria-expanded={item.id === open}
              onClick={() => setOpen(item.id === open ? null : item.id)}
            >
              {item.icon ? <Icon name={item.icon} small /> : null}
              {flatLabel(item)}
              {badgeShown(item, today) ? (
                <span className={`mn-badge t-${item.badge_tone}`}>{item.badge_text}</span>
              ) : null}
            </button>
          ))}
        </nav>
        {top ? (
          <div className="mn-mega">
            {top.children.length === 0 && auto.length === 0 && !feature ? (
              <p className="fhint">{t("noMega")}</p>
            ) : null}
            {auto.length > 0 ? (
              <div className="mn-col">
                <span className="cap">{t("groups")}</span>
                {auto.map((name) => (
                  <span key={name}>{name}</span>
                ))}
              </div>
            ) : null}
            {top.children.map((child) => (
              <div key={child.id} className="mn-col">
                <span className="cap">{labelOf({ ...child, depth: 1 } as FlatItem)}</span>
                {child.children.map((leaf) => (
                  <span key={leaf.id}>{labelOf({ ...leaf, depth: 2 } as FlatItem)}</span>
                ))}
              </div>
            ))}
            {feature ? (
              <div className="mn-feature">
                <span className="cap">{t("feature")}</span>
                <b>{feature.title}</b>
                <span className="fhint">{feature.note}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="fhint mn-tap">{t("tap")}</p>
        )}
      </div>
    </section>
  );
}
