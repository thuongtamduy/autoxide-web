import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { assignAction, setSnoozeAction, snoozeAction } from "@/app/(admin)/work/actions";
import { Icon, type IconName } from "@/components/shell/icon";
import { FormDialog } from "@/components/ui/form-dialog";
import { Time } from "@/components/ui/time";
import { NAV } from "@/nav/nav";
import { relativeTime, renderMessage } from "@/work/format";
import { bucketOf, groupByBucket, SNOOZE_PRESETS, type WorkRow } from "@/work/registry";
import { type Candidate, canHandle } from "@/work/server";
import { WORK_SOURCES } from "@/work/sources";
import { UndoButton } from "./undo-button";

const TONE = { blocking: "bad", attention: "warn", info: "info" } as const;

function iconOf(group: string): IconName {
  return NAV.find((g) => g.id === group)?.icon ?? "task";
}

/**
 * Hộp việc nhóm theo hạn (Quá hạn / Hôm nay / Sắp tới), dùng chung cho màn Việc và trang Tổng quan.
 * Mỗi việc: nút xử lý (mở màn gốc), hoãn tới giờ chọn, giao cho người có quyền. Hoãn và giao chưa có
 * API (bước 51 P10): chỉ hiện khi bật dữ liệu mẫu (`actions`).
 */
export async function TaskList({
  rows,
  now,
  candidates,
  actions,
  headingLevel = 3,
}: {
  rows: readonly WorkRow[];
  now: number;
  candidates: readonly Candidate[];
  actions: boolean;
  headingLevel?: 2 | 3;
}) {
  const [t, nav, locale] = await Promise.all([
    getTranslations("work"),
    getTranslations("nav"),
    getLocale(),
  ]);
  const say = (message: Parameters<typeof renderMessage>[1]) =>
    renderMessage((key, values) => t(key, values), message, locale);
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="wk-groups">
      {groupByBucket(rows, now).map((group) => (
        <section
          key={group.bucket}
          className="wk-group"
          aria-label={t(`box.buckets.${group.bucket}`)}
        >
          <Heading className="wk-ghead">
            <span className={group.bucket === "overdue" ? "cap tone-bad" : "cap"}>
              {t(`box.buckets.${group.bucket}`)}
            </span>
            <span className="cnt">{group.items.length}</span>
          </Heading>
          <ul className="wk-list">
            {group.items.map((row) => {
              const title = say(row.title);
              const source = WORK_SOURCES.find((s) => s.id === row.source);
              const due = row.due_at ? Date.parse(row.due_at) : null;
              const overdue = bucketOf(row, now) === "overdue";
              const people = candidates.filter((c) => canHandle(c, row.source, row));
              return (
                <li key={row.key} className="wk-task" data-key={row.key} data-state={row.state}>
                  <span className={`sq-ic ${TONE[row.severity]}`}>
                    <Icon name={iconOf(source?.group ?? "")} />
                  </span>
                  <div className="wk-main">
                    <span className="wk-title">{title}</span>
                    <span className="wk-meta">
                      <span className="tag">{nav(`groups.${source?.group ?? "home"}`)}</span>
                      {row.severity === "blocking" ? (
                        <span className="badge b-bad">{t("box.blocking")}</span>
                      ) : null}
                      <span className={overdue ? "wk-due tone-bad" : "wk-due"}>
                        {due === null
                          ? t("box.due.none")
                          : t(overdue ? "box.due.overdue" : "box.due.due", {
                              when: relativeTime(due, now, locale),
                            })}
                      </span>
                      {row.detail ? <span className="wk-detail">{say(row.detail)}</span> : null}
                      {source?.sample ? (
                        <span
                          className="badge b-sample"
                          title={t("box.sampleTitle", {
                            step: source.sample.step,
                            endpoint: source.sample.endpoint,
                          })}
                        >
                          {t("box.sample")}
                        </span>
                      ) : null}
                    </span>
                    <span className="wk-flags">
                      {row.assignee ? (
                        <span className="badge b-info">
                          {t("box.assignedTo", { name: row.assignee.name })}
                        </span>
                      ) : null}
                      {row.snoozed_until ? (
                        <span className="badge b-draft">
                          {t("box.snoozedUntil")} <Time value={row.snoozed_until} />
                        </span>
                      ) : null}
                    </span>
                    <details className="wk-why">
                      <summary>{t("box.why")}</summary>
                      <p>
                        {row.reason.permission
                          ? t("box.whyText", {
                              permission: row.reason.permission,
                              scope: say(row.reason.scope),
                            })
                          : t("box.whyAny", { scope: say(row.reason.scope) })}
                      </p>
                    </details>
                  </div>
                  <div className="wk-acts">
                    <Link className="btn sm" href={row.target.href}>
                      {t(`items.${row.title.key.split(".")[1]}.act`)}
                    </Link>
                    {actions ? (
                      <>
                        {row.state === "snoozed" ? (
                          <UndoButton
                            action={setSnoozeAction}
                            fields={{ key: row.key, restore: "" }}
                            label={t("box.unsnooze")}
                            ariaLabel={t("box.unsnoozeLabel", { title })}
                            done={t("box.unsnoozeDone")}
                            undo={{ label: t("box.undo"), done: t("box.undone") }}
                          />
                        ) : (
                          <FormDialog
                            action={snoozeAction}
                            label={t("box.snooze")}
                            ariaLabel={t("box.snoozeLabel", { title })}
                            title={t("box.snoozeTitle")}
                            intro={t("box.snoozeIntro", { title })}
                            submit={t("box.snoozeSubmit")}
                            done={t("box.snoozeDone")}
                            triggerClass="btn sm ghost"
                            undoAction={setSnoozeAction}
                            undoLabel={t("box.undo")}
                            undoDone={t("box.undone")}
                            fields={[
                              { kind: "hidden", name: "key", value: row.key },
                              {
                                kind: "select",
                                name: "preset",
                                label: t("box.snoozeWhen"),
                                defaultValue: "tomorrow",
                                options: SNOOZE_PRESETS.map((p) => ({
                                  value: p,
                                  label: t(`box.presets.${p}`),
                                })),
                              },
                            ]}
                          />
                        )}
                        <FormDialog
                          action={assignAction}
                          label={t("box.assign")}
                          ariaLabel={t("box.assignLabel", { title })}
                          title={t("box.assignTitle")}
                          intro={t("box.assignIntro", { title })}
                          submit={t("box.assignSubmit")}
                          done={t("box.assignDone")}
                          triggerClass="btn sm ghost"
                          undoAction={assignAction}
                          undoLabel={t("box.undo")}
                          undoDone={t("box.undone")}
                          fields={[
                            { kind: "hidden", name: "key", value: row.key },
                            {
                              kind: "select",
                              name: "user_id",
                              label: t("box.assignWho"),
                              hint: t("box.assignHint"),
                              defaultValue: row.assignee?.id ?? people[0]?.id ?? "",
                              options: [
                                ...people.map((p) => ({ value: p.id, label: p.name })),
                                { value: "", label: t("box.assignNone") },
                              ],
                            },
                          ]}
                        />
                      </>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
