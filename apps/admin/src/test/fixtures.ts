import type { ModuleInfo } from "@autoxide/sdk";

/** Một module khai đủ mọi thứ, như core trả cho `GET /api/v1/kernel/modules/{name}`. */
export const NOTES: ModuleInfo = {
  name: "notes",
  internal: false,
  position: 2,
  permissions: [{ name: "notes.write", description: "Write notes." }],
  events: [{ name: "notes.note_created", description: "A note was created." }],
  subscriptions: ["*"],
  jobs: ["notes.cleanup"],
  schedules: [{ name: "notes.nightly", kind: "notes.cleanup", every_seconds: 86_400 }],
  tools: [
    {
      name: "notes.delete_note",
      description: "Delete a note.",
      permissions: ["notes.write"],
      read_only: false,
      destructive: true,
    },
    {
      name: "notes.count",
      description: "Count notes.",
      permissions: [],
      read_only: true,
      destructive: false,
    },
  ],
  deprecations: [
    {
      method: "GET",
      path: "/api/v1/notes/{id}",
      since: "2026-11-01",
      sunset: null,
      successor: "/api/v2/notes/{id}",
    },
  ],
  languages: ["vi"],
  migrations: [
    { name: "m0001_create_items", applied: true },
    { name: "m0002_add_index", applied: false },
  ],
};

export const KERNEL: ModuleInfo = {
  ...NOTES,
  name: "kernel",
  internal: true,
  position: 0,
  permissions: [],
  events: [],
  subscriptions: [],
  jobs: [],
  schedules: [],
  tools: [],
  deprecations: [],
  languages: [],
  migrations: [{ name: "m0001_create_secrets", applied: null }],
};
