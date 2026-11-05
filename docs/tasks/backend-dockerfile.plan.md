# Plan: Backend Dockerfile

Files: `backend/Dockerfile`, `backend/.dockerignore`. No tests exist for a Dockerfile; each item is checked by reading the file, plus one `go build`.

- [x] Flags build both programs: `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o <tmp outside repo> ./cmd/server ./cmd/migrate` in `backend/` (check: command run, result reported: succeeded, both binaries built)
- [x] Exactly two stages, only `golang:1.26` and `gcr.io/distroless/static-debian12:nonroot`, no `latest` (`backend/Dockerfile`, read)
- [x] Build stage copies `go.mod`/`go.sum` and runs `go mod download` before copying the rest (`backend/Dockerfile`, read)
- [x] Builds `./cmd/server` and `./cmd/migrate` with `CGO_ENABLED=0`, `GOTOOLCHAIN=local` (`backend/Dockerfile`, read)
- [x] Runtime has `/app/server`, `/app/migrate`, `/app/migration/` with all files of `backend/migration/`, `WORKDIR /app` (`backend/Dockerfile`, compare file list)
- [x] `USER 65532:65532`; exec-form `ENTRYPOINT ["/app/server"]`, no CMD (`backend/Dockerfile`, read)
- [x] Only `ENV HTTP_ADDR=:8080`; `EXPOSE 8080` (`backend/Dockerfile`, read)
- [x] No secret/password/token/connection string in either file (both, grep)
- [x] Header comment holds build, run, migrate commands in full, no-secrets/no-migrate-at-start note, and the `--env-file` caution (`backend/Dockerfile`, read)
- [x] `.dockerignore` patterns in the given order, none of the kept paths; `COPY --chown=65532:65532` for `migration/` (`backend/.dockerignore`, `backend/Dockerfile`, read)
- [x] `make check` passes; only the two files and this plan changed (`git diff --stat`)
- [x] `make test-integration-local` (task touches `backend/`): run, passed (PostgreSQL 16)

## Judgment calls

- `go mod download` and the build stage use `WORKDIR /src`; the task named no path.
- Both binaries are built in one `RUN` (two `go build` commands joined with `&&`) to keep one layer.
- Server and migrate are copied in one `COPY --from=build` line into `/app/` (owned by root, world-readable/executable by default; only `migration/` needed `--chown` per the task).
- The header also states that the image was not built or run by the author.
- `make check` needed `npm ci` in `frontend/` first (fresh checkout); no tracked file changed by it.
