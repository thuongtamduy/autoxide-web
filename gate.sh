#!/usr/bin/env bash
# Gate của autoxide-web: định nghĩa "xong". Một thay đổi chỉ được commit khi lệnh này xanh.
# Chạy:  ./gate.sh
#
# Theo thứ tự (dừng ở bước đỏ đầu tiên):
#   1. cài thư viện đúng lockfile   pnpm install --frozen-lockfile
#   2. lint + định dạng              biome check
#   3. kiểu dữ liệu                  tsc (mọi gói)
#   4. secret                        gitleaks (cài sẵn thì dùng, không thì chạy image Docker)
#   5. test đơn vị                   vitest
#   6. build                         next build (bản standalone)
#   7. test e2e                      Playwright với core giả, trên bản build ở bước 6
#
# Biến môi trường (không bắt buộc):
#   PLAYWRIGHT_CHROMIUM_EXECUTABLE   Chromium có sẵn thay cho bản `playwright install`.
#   GATE_GITLEAKS_IMAGE              image gitleaks khi máy không cài gitleaks.
#
# Gate đỏ thì sửa code. Không nới gate, không tắt lint, không bỏ qua test (CLAUDE.md).

set -euo pipefail
cd "$(dirname "$0")"

GITLEAKS_IMAGE="${GATE_GITLEAKS_IMAGE:-zricethezav/gitleaks:v8.30.0}"

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() {
  printf '\033[31mgate: %s\033[0m\n' "$*" >&2
  exit 1
}

step "dependencies (pnpm install --frozen-lockfile)"
pnpm install --frozen-lockfile

step "lint and format (biome)"
pnpm exec biome check .

step "types (tsc)"
pnpm turbo run typecheck

gitleaks_run() {
  if command -v gitleaks >/dev/null 2>&1; then
    gitleaks "$@"
  else
    command -v docker >/dev/null 2>&1 || fail "Install gitleaks (https://github.com/gitleaks/gitleaks) or Docker."
    docker info >/dev/null 2>&1 || fail "Docker is installed but not running (or not accessible to this user)."
    docker run --rm --volume "$PWD:/repo" --workdir /repo "$GITLEAKS_IMAGE" "$@"
  fi
}

step "secrets (gitleaks)"
# Như gate của core: toàn bộ lịch sử git, rồi thay đổi đã stage và chưa stage.
leaks=(--no-banner --redact --config .gitleaks.toml)
gitleaks_run git . "${leaks[@]}"
gitleaks_run git . "${leaks[@]}" --pre-commit --staged
gitleaks_run git . "${leaks[@]}" --pre-commit

step "unit tests (vitest)"
pnpm turbo run test

step "build (next build)"
pnpm turbo run build

step "end-to-end tests (playwright, mock core)"
pnpm --filter @autoxide/admin e2e

printf '\n\033[32mgate: green — lint, types, secrets, unit tests, build, end-to-end tests\033[0m\n'
