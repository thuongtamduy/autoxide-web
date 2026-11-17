import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  bulkPauseAction,
  bulkResumeAction,
  disconnectAction,
  runningAction,
  undoPauseAction,
  undoResumeAction,
} from "@/app/(admin)/sales/channels/actions";
import { ReconnectDialog } from "@/components/channels/forms";
import { ChangeButtons, ConfirmButton } from "@/components/engage/actions";
import { Chips } from "@/components/engage/common";
import {
  BlockHead,
  DetailRow,
  hrefWith,
  KV,
  OpenLink,
  param,
  Status,
  Tiles,
} from "@/components/growth/blocks";
import { BulkTable, SelectAllTh, SelectTd } from "@/components/ui/bulk";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Table, Td, Th } from "@/components/ui/table";
import { Time } from "@/components/ui/time";
import { CHANNELS_MANAGE } from "@/lib/channels";
import { can } from "@/lib/viewer";
import type { AccountStatus } from "@/sample/channel-accounts";
import { listAccounts, listConnectors } from "@/sample/channels";
import { CHANNEL_TABS } from "./shared";

const CHIPS: readonly AccountStatus[] = ["active", "reauth_required", "paused", "unavailable"];
const ACCOUNT_TONE: Record<AccountStatus, string> = {
  active: "b-ok",
  paused: "b-draft",
  reauth_required: "b-bad",
  unavailable: "b-arch",
  disconnected: "b-arch",
};

// Tab "Tài khoản kênh": mỗi kênh cần một bộ nối (module riêng, D-191 của core); tài khoản của kênh chưa có
// bộ nối nằm ở "Chưa có bộ nối" và không ảnh hưởng kênh khác. Khoá kết nối lưu ở kho secret, không hiện lại.
// Dòng hiện một nút (tạm dừng / chạy lại / kết nối lại), "Ngắt kết nối" và chi tiết trong "⋯"; chọn nhiều
// để tạm dừng hay chạy lại (lặp lệnh từng tài khoản, có Hoàn tác).
export default async function AccountsPage(props: PageProps<"/sales/channels">) {
  if (!(await can(CHANNEL_TABS.accounts))) notFound();
  const [t, tt, params, accounts, connectors, manage] = await Promise.all([
    getTranslations("channels"),
    getTranslations("table"),
    props.searchParams,
    listAccounts(),
    listConnectors(),
    can(CHANNELS_MANAGE),
  ]);
  const chip = CHIPS.find((c) => c === param(params, "chip")) ?? null;
  const open = param(params, "open");
  const base = { chip: chip ?? "" };
  const rows = accounts.data.filter((a) => !chip || a.status === chip);
  return (
    <div className="blocks">
      <p className="note">
        <b>{t("accounts.noteTitle")}</b> {t("accounts.noteText")}
      </p>
      <section className="block" aria-labelledby="ch-accounts-h">
        <BlockHead id="ch-accounts-h" title={t("accounts.title")} about={t("accounts.about")} />
        <Chips
          label={t("accounts.filter")}
          chips={[
            {
              href: "/sales/channels",
              label: t("accounts.all"),
              on: !chip,
              count: accounts.data.length,
            },
            ...CHIPS.map((c) => ({
              href: hrefWith("/sales/channels", {}, { chip: c }),
              label: t(`accountState.${c}`),
              on: chip === c,
              count: accounts.data.filter((a) => a.status === c).length,
            })),
          ]}
        />
        <div className="card tcard">
          <BulkTable
            ids={rows.map((a) => a.id)}
            actions={
              manage
                ? [
                    {
                      key: "pause",
                      label: t("accounts.pause"),
                      run: bulkPauseAction,
                      undo: undoPauseAction,
                    },
                    {
                      key: "resume",
                      label: t("accounts.resume"),
                      run: bulkResumeAction,
                      undo: undoResumeAction,
                    },
                  ]
                : []
            }
          >
            <Table cards>
              <thead>
                <tr>
                  {manage ? <SelectAllTh /> : null}
                  <Th>{t("accounts.account")}</Th>
                  <Th>{t("accounts.store")}</Th>
                  <Th>{t("accounts.warehouse")}</Th>
                  <Th>{t("accounts.synced")}</Th>
                  <Th>{t("accounts.state")}</Th>
                  <Th>
                    <span className="vh">{t("actions")}</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const isOpen = open === a.id;
                  const live =
                    a.status === "active" ||
                    a.status === "paused" ||
                    a.status === "reauth_required";
                  const menu: RowMenuItem[] = [
                    {
                      label: isOpen ? t("accounts.hideDetail") : t("accounts.openDetail"),
                      href: isOpen
                        ? hrefWith("/sales/channels", base, {})
                        : hrefWith("/sales/channels", base, { open: a.id }, "#ch-accounts-h"),
                    },
                  ];
                  if (manage && live) {
                    menu.push({
                      label: t("accounts.disconnect"),
                      danger: true,
                      dialog: (
                        <ConfirmButton
                          action={disconnectAction}
                          fields={{ id: a.id }}
                          label={t("accounts.disconnect")}
                          title={t("accounts.disconnectTitle", { name: a.name })}
                          points={[
                            t("accounts.disconnect1"),
                            t("accounts.disconnect2"),
                            t("accounts.disconnect3"),
                          ]}
                          submit={t("accounts.disconnectSubmit")}
                          done={t("accounts.disconnected")}
                        />
                      ),
                    });
                  }
                  return [
                    <tr key={a.id} data-current={isOpen ? "" : undefined}>
                      {manage ? <SelectTd id={a.id} name={a.name} /> : null}
                      <Td className="rt-title">
                        <span className="cell2">
                          <OpenLink
                            open={isOpen}
                            href={hrefWith(
                              "/sales/channels",
                              base,
                              { open: a.id },
                              "#ch-accounts-h",
                            )}
                            closeHref={hrefWith("/sales/channels", base, {})}
                          >
                            {a.name}
                          </OpenLink>
                          <span className="sub">{t(`kinds.${a.kind}`)}</span>
                        </span>
                      </Td>
                      <Td label={t("accounts.store")}>{a.org_name}</Td>
                      <Td label={t("accounts.warehouse")}>{a.warehouse_names.join(", ")}</Td>
                      <Td label={t("accounts.synced")}>
                        {a.last_synced_at ? <Time value={a.last_synced_at} /> : "—"}
                      </Td>
                      <Td label={t("accounts.state")}>
                        <Status tone={ACCOUNT_TONE[a.status]}>
                          {t(`accountState.${a.status}`)}
                        </Status>
                      </Td>
                      <Td className="rt-acts">
                        <span className="row-acts">
                          {manage && (a.status === "active" || a.status === "paused") ? (
                            <ChangeButtons
                              action={runningAction}
                              id={a.id}
                              expect={a.updated_at}
                              moves={
                                a.status === "active"
                                  ? [
                                      {
                                        value: "paused",
                                        label: t("accounts.pause"),
                                        done: t("accounts.paused"),
                                      },
                                    ]
                                  : [
                                      {
                                        value: "active",
                                        label: t("accounts.resume"),
                                        done: t("accounts.resumed"),
                                        tone: "pri",
                                      },
                                    ]
                              }
                              undo={{ label: t("undo"), done: t("undone") }}
                            />
                          ) : null}
                          {manage && a.status === "reauth_required" ? (
                            <ReconnectDialog id={a.id} name={a.name} />
                          ) : null}
                          <RowMenu label={tt("moreFor", { name: a.name })} items={menu} />
                        </span>
                      </Td>
                    </tr>,
                    isOpen ? (
                      <DetailRow key={`${a.id}-open`} cols={manage ? 7 : 6}>
                        <h3 className="h2">{a.name}</h3>
                        <KV
                          items={[
                            [
                              t("accounts.connector"),
                              t(
                                `connector.${connectors.data.find((c) => c.kind === a.kind)?.installed ? "installed" : "missing"}`,
                                { kind: a.kind },
                              ),
                            ],
                            [
                              t("accounts.credentials"),
                              a.credentials_set_at
                                ? t("accounts.credentialsSet")
                                : t("accounts.credentialsNone"),
                            ],
                            a.credentials_set_at
                              ? [
                                  t("accounts.credentialsAt"),
                                  <Time key="c" value={a.credentials_set_at} />,
                                ]
                              : null,
                            [t("accounts.priceList"), a.org_name],
                            [
                              t("accounts.pull"),
                              t("accounts.pullEvery", { n: a.settings.order_pull_minutes }),
                            ],
                            [
                              t("accounts.autoCancel"),
                              a.settings.auto_cancel_oversold ? t("on") : t("off"),
                            ],
                            a.status_reason
                              ? [
                                  t("accounts.reason"),
                                  a.status_reason.startsWith("channels.")
                                    ? t(`codes.${a.status_reason.replaceAll(".", "_")}`, {
                                        detail: "",
                                      })
                                    : a.status_reason,
                                ]
                              : null,
                            a.status_changed_by
                              ? [t("accounts.changedBy"), a.status_changed_by.name]
                              : null,
                            [t("accounts.since"), <Time key="s" value={a.status_changed_at} />],
                          ]}
                        />
                        <p className="fhint">{t(`accountNote.${a.status}`)}</p>
                      </DetailRow>
                    ) : null,
                  ];
                })}
              </tbody>
            </Table>
          </BulkTable>
        </div>
      </section>
      <section className="block" aria-labelledby="connectors-h">
        <BlockHead id="connectors-h" title={t("connectors.title")} about={t("connectors.about")} />
        <Tiles
          items={connectors.data.map((c) => ({
            title: t(`kinds.${c.kind}`),
            badge: (
              <Status tone={c.installed ? "b-ok" : "b-arch"}>
                {c.installed ? t("connectors.installed") : t("connectors.missing")}
              </Status>
            ),
            text: c.installed
              ? c.capabilities.map((x) => t(`capabilities.${x}`)).join(", ")
              : t("connectors.needModule"),
            ...(c.max_batch ? { meta: t("connectors.batch", { n: c.max_batch }) } : {}),
          }))}
        />
      </section>
    </div>
  );
}
