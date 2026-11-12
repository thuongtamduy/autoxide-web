// SDK gọi API của core Autoxide, sinh từ `openapi.json` (D-097 của core).
//
// Kiểu dữ liệu ở `schema.d.ts` do `pnpm sdk:generate` sinh ra — đừng sửa tay. API đổi thì
// sinh lại; chỗ gọi sai sẽ bị trình biên dịch báo.
import createClient, { type Client, type Middleware } from "openapi-fetch";
import type { components, paths } from "./schema";

export type { components, paths } from "./schema";

type Schemas = components["schemas"];
export type Problem = Schemas["Problem"];
export type TokenResponse = Schemas["TokenResponse"];
export type MfaChallenge = Schemas["MfaChallengeResponse"];
export type Me = Schemas["MeResponse"];
export type ModuleInfo = Schemas["ModuleInfo"];
export type ModuleMigration = Schemas["ModuleMigration"];

export type AutoxideClient = Client<paths>;

export interface ClientOptions {
  /** Gốc của core, vd `http://127.0.0.1:8080` (không có `/api/v1`). */
  baseUrl: string;
  /** Access token của người đang đăng nhập; không có thì gọi như khách. */
  accessToken?: string | undefined;
  /** Ngôn ngữ của thông báo lỗi (`Accept-Language`), vd `vi`. */
  language?: string | undefined;
  /** `fetch` thay thế (test). */
  fetch?: (request: Request) => Promise<Response>;
}

/** Phương thức ghi: core nhận `Idempotency-Key` cho các lệnh này. */
const WRITES = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Gắn header chung vào mọi request gửi tới core. */
export function headersMiddleware(options: ClientOptions): Middleware {
  return {
    onRequest({ request }) {
      if (options.accessToken) {
        request.headers.set("Authorization", `Bearer ${options.accessToken}`);
      }
      if (options.language) {
        request.headers.set("Accept-Language", options.language);
      }
      // Mỗi lệnh ghi một khoá mới: core trả lại kết quả lần đầu nếu cùng request bị gửi
      // lại (mạng chập chờn, proxy retry), không làm hai lần.
      if (WRITES.has(request.method) && !request.headers.has("Idempotency-Key")) {
        request.headers.set("Idempotency-Key", crypto.randomUUID());
      }
      return request;
    },
  };
}

export function createAutoxideClient(options: ClientOptions): AutoxideClient {
  const client = createClient<paths>({
    baseUrl: options.baseUrl.replace(/\/+$/, ""),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  });
  client.use(headersMiddleware(options));
  return client;
}

/** Lỗi trả từ core, giữ nguyên Problem (RFC 9457) để giao diện tra theo `code`. */
export class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem;

  constructor(status: number, problem: Problem) {
    super(`${problem.code}: ${problem.detail}`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }

  get code(): string {
    return this.problem.code;
  }
}

/** Đổi phần lỗi của một lời gọi thành `ApiError`, kể cả khi thân không phải Problem. */
export function toApiError(response: Response, error: unknown): ApiError {
  if (isProblem(error)) {
    return new ApiError(response.status, error);
  }
  return new ApiError(response.status, {
    type: "about:blank",
    title: response.statusText || "Error",
    status: response.status,
    code: "http_error",
    detail: `The server answered ${response.status} without problem details.`,
  });
}

function isProblem(value: unknown): value is Problem {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    typeof (value as { detail?: unknown }).detail === "string"
  );
}
