# Verification report: Backend Dockerfile

Branch: `claude/backend-dockerfile-i4tqpl-f27316`

No requirement ID covers this task (it serves the deployment in `STACK.md`). **The image was not built or run: the verifier cannot run Docker. Nothing below is "verified by build".** Verification is by reading the two files plus the one Go command.

## Commands run
- `make check`: passed (exit 0; `npm ci` in `frontend/` first; 7 redocly warnings, no errors).
- `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o <tmp dir outside repo> ./cmd/server ./cmd/migrate` in `backend/`: succeeded, both `server` and `migrate` produced. No binary committed.
- `make test-integration-local`: **run, passed** (PostgreSQL 16, `/usr/lib/postgresql/16/bin`). The Dockerfile task adds no Go code, so no integration test exercises it; no acceptance criterion depends on integration tests.

## Acceptance criteria
There are no tests for a Dockerfile; every row is checked by reading, so none of them can "pass without the behavior": there is no test to be hollow.

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `go build` with the Dockerfile's flags builds both programs | Met | Command above, succeeded |
| 2 | Exactly two stages, only the two named images, no `latest` | Met | `Dockerfile`: 2 `FROM` lines, `golang:1.26 AS build` then `gcr.io/distroless/static-debian12:nonroot`; both named in `STACK.md` line 81; grep for `latest` finds nothing |
| 3 | `go.mod`/`go.sum` copied and `go mod download` before the rest | Met | `COPY go.mod go.sum ./`, `RUN go mod download`, then `COPY . .` |
| 4 | Builds both programs with `CGO_ENABLED=0`; `GOTOOLCHAIN=local` | Met | `ENV GOTOOLCHAIN=local`; one `RUN` with two `CGO_ENABLED=0 go build ... ./cmd/server` / `./cmd/migrate` into `/out/` |
| 5 | Runtime has `/app/server`, `/app/migrate`, `/app/migration/` with all files; `WORKDIR /app` | Met | `WORKDIR /app`; `COPY --from=build /out/server /out/migrate /app/`; `COPY ... migration /app/migration/` copies the whole folder (4 files: 000001/000002 up and down); nothing in `.dockerignore` matches them |
| 6 | `USER 65532:65532`; exec-form `/app/server` entrypoint | Met | `USER 65532:65532`; `ENTRYPOINT ["/app/server"]`; no `CMD` |
| 7 | Only `ENV` is `HTTP_ADDR=:8080`; `EXPOSE 8080` | Met | Build stage also has `ENV GOTOOLCHAIN=local`, which the task requires and which does not reach the runtime stage; runtime stage has one `ENV` |
| 8 | No secret/password/token/connection string | Met | grep: only the words "no secrets" in a comment; placeholders are `<env file>`, `<direct connection url>` |
| 9 | Header comment: build, run, migrate in full, no-secrets/no-migrate note, `--env-file` caution | Met | Lines 1-20; all three commands match the task text character for character; caution covers `HTTP_ADDR`, `localhost`, quotes |
| 10 | `.dockerignore` patterns in order, kept paths not excluded; `--chown` on migration copy | Met | Order: `.git`, `.env`, `.env.*`, `!.env.example`, `**/bin/`, `**/*.test`, `**/*.out`, `coverage.txt`, `Dockerfile`, `.dockerignore`; one pattern per line with group comments; `COPY --chown=65532:65532 migration /app/migration/` |
| 11 | `make check` passes; nothing outside the two files and the plan changed | Met | `git diff --stat origin/main...HEAD`: `backend/Dockerfile`, `backend/.dockerignore`, plan only |

## Cross-checks against the code
- `cmd/migrate/main.go:14` default `-dir` is `migration`; with `WORKDIR /app` it resolves to `/app/migration`. Match.
- `config.go:44` default `HTTP_ADDR` is `:8085`; image sets `:8080`. Match with the task.
- `handler/router.go:62` has `GET /healthz`. Match.
- No directory named `bin`, and no `*.out` or `*.test` files, under `backend/`, so the recursive patterns remove nothing the build needs.

## Plan check
- Every acceptance criterion has a plan item (11 criteria, 11 build items plus the integration-test item). None missing.
- No test is ticked that does not exist: all ticks are read-checks, as the plan says. The tick "make test-integration-local: run, passed (PostgreSQL 16)" matches my own run.
- Plan vs diff: no difference. The plan's judgment calls (`/src` workdir, one `RUN`, one `COPY --from=build` line) match the Dockerfile.

## Rule checks
- Only `handler/` imports `internal/api`: not applicable, no Go code changed.
- Repository queries filter by `user_id`: not applicable, no queries changed.
- `users.version` incremented in write transactions: not applicable, no write paths changed.
- `go.mod` go/toolchain lines and dependencies: unchanged (`go.mod` and `go.sum` not in the diff).
- Verifier checks from the task file: all done above. `Makefile`, `.env.example`, `docker-compose.yml` unchanged.

## Findings
**Blocking:** none.

**Non-blocking:**
1. `COPY . .` in the build stage is placed after `go mod download` as required, but `.dockerignore` does not exclude `migration/` from that copy, so a migration edit invalidates the build layer. Harmless, and the task forbids excluding it.
2. Binaries in `/app` are owned by root (readable and executable by 65532). Works; the task asks for `--chown` only on `migration/`.
3. Everything that needs Docker is still unchecked and is the user's: build the image, run `/app/migrate`, start the server, call `GET /healthz`. One thing to watch when building: `COPY --from=build /out/server /out/migrate /app/` relies on the trailing slash to treat `/app/` as a directory.
