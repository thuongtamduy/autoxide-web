// Màn "Trang và cấu trúc" cho core giả: danh mục và thẻ, tác giả, chuyển hướng, chuyển trang cha,
// đọc một phiên bản, menu cũ (chỉ đọc). Hình dạng theo `openapi.json` (`satisfies` kiểu của SDK).
// Bài viết, danh mục, tác giả, phiên bản là kho của `mock-content.ts`, đưa vào qua `Store`.
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { problem, type Schemas, send, text } from "./mock-http.ts";

type Entry = Schemas["EntryResponse"];

export interface Store {
  entries: () => Entry[];
  terms: () => Schemas["TermResponse"][];
  authors: () => Schemas["AuthorResponse"][];
  revisions: () => Schemas["RevisionResponse"][];
  now: () => string;
  sendEntry: (status: number, entry: Entry) => void;
  versionOk: (entry: Entry) => boolean;
}

let redirects: Schemas["RedirectResponse"][] = [];
let menus: Schemas["MenuResponse"][] = [];

export function resetStructure() {
  redirects = [
    {
      id: "01a1e100-0000-7000-8000-000000000001",
      locale: "vi",
      from_path: "/gioi-thieu-cu",
      to_url: "/gioi-thieu",
      to_entry_id: null,
      status_code: 301,
      source: "auto",
      created_by: null,
      created_at: "2026-11-14T00:00:00Z",
      updated_at: "2026-11-14T00:00:00Z",
    },
  ];
  menus = [
    {
      id: "01a1e100-0000-7000-8000-0000000000a1",
      key: "blog",
      locale: "vi",
      created_at: "2026-11-10T00:00:00Z",
      updated_at: "2026-11-10T00:00:00Z",
      items: [
        {
          id: "01a1e100-0000-7000-8000-0000000000b1",
          label: "Tất cả bài",
          url: "/goc-bep",
          children: [],
        },
        {
          id: "01a1e100-0000-7000-8000-0000000000b2",
          label: "Liên hệ",
          url: "mailto:hotro@example.com",
          children: [],
        },
      ],
    },
  ];
}

function etagged(response: ServerResponse, status: number, data: { updated_at: string }) {
  response.writeHead(status, { "Content-Type": "application/json", ETag: `"${data.updated_at}"` });
  response.end(JSON.stringify({ data }));
}

function ifMatchOk(
  request: IncomingMessage,
  response: ServerResponse,
  data: { updated_at: string },
) {
  const ifMatch = request.headers["if-match"];
  if (!ifMatch) {
    problem(response, 428, "precondition_required", "Send the ETag you read in If-Match.");
    return false;
  }
  if (ifMatch !== "*" && ifMatch !== `"${data.updated_at}"`) {
    problem(response, 412, "precondition_failed", "It changed since you read it.");
    return false;
  }
  return true;
}

function slugOf(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Xử lý route của màn cấu trúc; `false` khi không phải route của nó. */
export async function structureRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: string,
  body: Record<string, unknown>,
  store: Store,
): Promise<boolean> {
  const P = "/api/v1/content";
  const path = url.pathname;

  // ---------------------------------------------------------------- Danh mục và thẻ
  if (route === `POST ${P}/terms`) {
    const name = text(body, "name").trim();
    if (!name) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "name", code: "length", detail: "must be 1 to 200 characters" },
      ]);
      return true;
    }
    const locale = text(body, "locale") || "en";
    const slug = text(body, "slug").trim() || slugOf(name);
    const taxonomy = body.taxonomy === "tag" ? "tag" : "category";
    if (
      store
        .terms()
        .some(
          (t) =>
            t.taxonomy === taxonomy && t.names.some((n) => n.locale === locale && n.slug === slug),
        )
    ) {
      problem(response, 409, "content.slug_taken", "Another term has this slug.");
      return true;
    }
    const at = store.now();
    const term: Schemas["TermResponse"] = {
      id: randomUUID(),
      taxonomy,
      parent_id: taxonomy === "category" ? ((body.parent_id as string | null) ?? null) : null,
      names: [
        {
          locale,
          name,
          slug,
          description: text(body, "description"),
          meta_title: "",
          meta_description: "",
        },
      ],
      created_at: at,
      updated_at: at,
    };
    store.terms().push(term);
    etagged(response, 201, term);
    return true;
  }
  const term = path.match(/^\/api\/v1\/content\/terms\/([^/]+)$/);
  if (term) {
    const found = store.terms().find((t) => t.id === term[1]);
    if (!found) {
      problem(response, 404, "content.term_not_found", "No term has this id.");
      return true;
    }
    if (request.method === "GET") etagged(response, 200, found);
    if (request.method === "DELETE") {
      if (store.terms().some((t) => t.parent_id === found.id)) {
        problem(response, 409, "content.term_has_children", "The category has subcategories.");
        return true;
      }
      store.terms().splice(store.terms().indexOf(found), 1);
      send(response, 204);
    }
    if (request.method === "PATCH") {
      if (!ifMatchOk(request, response, found)) return true;
      const locale = text(body, "locale") || "en";
      const name = found.names.find((n) => n.locale === locale);
      const next = {
        locale,
        name: text(body, "name") || name?.name || "",
        slug: text(body, "slug") || name?.slug || slugOf(text(body, "name")),
        description: text(body, "description"),
        meta_title: "",
        meta_description: "",
      };
      found.names = [...found.names.filter((n) => n.locale !== locale), next];
      if ("parent_id" in body) found.parent_id = (body.parent_id as string | null) ?? null;
      found.updated_at = store.now();
      etagged(response, 200, found);
    }
    return true;
  }

  // ---------------------------------------------------------------- Tác giả
  if (route === `POST ${P}/authors`) {
    const name = text(body, "display_name").trim();
    if (!name) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", [
        { field: "display_name", code: "length", detail: "must be 1 to 200 characters" },
      ]);
      return true;
    }
    const at = store.now();
    const author: Schemas["AuthorResponse"] = {
      id: randomUUID(),
      user_id: null,
      display_name: name,
      slug: text(body, "slug") || slugOf(name),
      bio: text(body, "bio"),
      avatar_media_id: null,
      website_url: text(body, "website_url"),
      created_at: at,
      updated_at: at,
    };
    store.authors().push(author);
    etagged(response, 201, author);
    return true;
  }
  const author = path.match(/^\/api\/v1\/content\/authors\/([^/]+)$/);
  if (author) {
    const found = store.authors().find((a) => a.id === author[1]);
    if (!found) {
      problem(response, 404, "content.author_not_found", "No author has this id.");
      return true;
    }
    if (request.method === "GET") etagged(response, 200, found);
    if (request.method === "DELETE") {
      store.authors().splice(store.authors().indexOf(found), 1);
      send(response, 204);
    }
    if (request.method === "PATCH") {
      if (!ifMatchOk(request, response, found)) return true;
      found.display_name = text(body, "display_name") || found.display_name;
      found.bio = text(body, "bio");
      found.website_url = text(body, "website_url");
      found.updated_at = store.now();
      etagged(response, 200, found);
    }
    return true;
  }

  // ---------------------------------------------------------------- Chuyển hướng
  if (route === `GET ${P}/redirects`) {
    const source = url.searchParams.get("source");
    send(response, 200, {
      data: redirects.filter((r) => !source || r.source === source),
      pagination: { limit: 50, next_cursor: null },
    } satisfies Schemas["Page_RedirectResponse"]);
    return true;
  }
  const redirectFields = (): Schemas["ProblemField"][] => {
    const errors: Schemas["ProblemField"][] = [];
    const to = body.to_url;
    if (!text(body, "from_path").startsWith("/")) {
      errors.push({ field: "from_path", code: "invalid", detail: "must start with `/`" });
    }
    if (
      typeof to === "string" &&
      !(to.startsWith("https://") || (to.startsWith("/") && !to.startsWith("//")))
    ) {
      errors.push({
        field: "to_url",
        code: "invalid",
        detail: "must be an `https://` address or a path starting with a single `/`",
      });
    }
    return errors;
  };
  if (route === `POST ${P}/redirects`) {
    const errors = redirectFields();
    if (errors.length > 0) {
      problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
      return true;
    }
    if (redirects.some((r) => r.from_path === text(body, "from_path"))) {
      problem(
        response,
        409,
        "content.redirect_exists",
        "A redirect from this address already exists.",
      );
      return true;
    }
    const at = store.now();
    const redirect: Schemas["RedirectResponse"] = {
      id: randomUUID(),
      locale: text(body, "locale") || "en",
      from_path: text(body, "from_path"),
      to_url: (body.to_url as string | null) ?? null,
      to_entry_id: (body.to_entry_id as string | null) ?? null,
      status_code: Number(body.status_code ?? 301),
      source: "manual",
      created_by: null,
      created_at: at,
      updated_at: at,
    };
    redirects.push(redirect);
    etagged(response, 201, redirect);
    return true;
  }
  const redirect = path.match(/^\/api\/v1\/content\/redirects\/([^/]+)$/);
  if (redirect) {
    const found = redirects.find((r) => r.id === redirect[1]);
    if (!found) {
      problem(response, 404, "content.redirect_not_found", "No redirect has this id.");
      return true;
    }
    if (request.method === "GET") etagged(response, 200, found);
    if (request.method === "DELETE") {
      redirects = redirects.filter((r) => r !== found);
      send(response, 204);
    }
    if (request.method === "PATCH") {
      if (!ifMatchOk(request, response, found)) return true;
      const errors = redirectFields();
      if (errors.length > 0) {
        problem(response, 422, "validation_failed", "The request has invalid fields.", errors);
        return true;
      }
      Object.assign(found, {
        from_path: text(body, "from_path"),
        to_url: (body.to_url as string | null) ?? null,
        to_entry_id: (body.to_entry_id as string | null) ?? null,
        status_code: Number(body.status_code ?? 301),
        updated_at: store.now(),
      });
      etagged(response, 200, found);
    }
    return true;
  }

  // ---------------------------------------------------------------- Menu cũ (chỉ đọc)
  if (route === `GET ${P}/menus`) {
    send(response, 200, {
      data: menus.map(({ id, key, locale, updated_at }) => ({ id, key, locale, updated_at })),
    } satisfies Schemas["Data_Vec_MenuSummary"]);
    return true;
  }
  const menu = path.match(/^\/api\/v1\/content\/menus\/([^/]+)$/);
  if (menu && request.method === "GET") {
    const found = menus.find(
      (m) => m.key === menu[1] && m.locale === (url.searchParams.get("locale") ?? m.locale),
    );
    if (!found) problem(response, 404, "content.menu_not_found", "No menu has this key.");
    else send(response, 200, { data: found } satisfies Schemas["Data_MenuResponse"]);
    return true;
  }

  // ---------------------------------------------------------------- Trang, phiên bản
  const move = path.match(/^\/api\/v1\/content\/entries\/([^/]+)\/move$/);
  if (move && request.method === "POST") {
    const entry = store.entries().find((e) => e.id === move[1]);
    if (!entry) {
      problem(response, 404, "content.not_found", "No entry has this id.");
      return true;
    }
    if (!store.versionOk(entry)) return true;
    const parent = (body.parent_id as string | null) ?? null;
    let walk = parent;
    while (walk) {
      if (walk === entry.id) {
        problem(
          response,
          409,
          "content.tree_cycle",
          "A page cannot move under itself or a subpage.",
        );
        return true;
      }
      walk = store.entries().find((e) => e.id === walk)?.parent_id ?? null;
    }
    entry.parent_id = parent;
    entry.updated_at = store.now();
    store.sendEntry(200, entry);
    return true;
  }
  const revision = path.match(/^\/api\/v1\/content\/entries\/([^/]+)\/revisions\/([^/]+)$/);
  if (revision && request.method === "GET") {
    const found = store.revisions().find((r) => r.id === revision[2] && r.entry_id === revision[1]);
    if (!found)
      problem(response, 404, "content.revision_not_found", "No such revision of this entry.");
    else send(response, 200, { data: found } satisfies Schemas["Data_RevisionResponse"]);
    return true;
  }
  return false;
}
