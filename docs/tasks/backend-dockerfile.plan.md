# Plan: Backend Dockerfile

Files: `backend/Dockerfile`, `backend/.dockerignore`. No tests exist for a Dockerfile; each item is checked by reading the file, plus one `go build`.

- [ ] Flags build both programs: `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o <tmp outside repo> ./cmd/server ./cmd/migrate` in `backend/` (check: command run, result reported)
- [ ] Exactly two stages, only `golang:1.26` and `gcr.io/distroless/static-debian12:nonroot`, no `latest` (`backend/Dockerfile`, read)
- [ ] Build stage copies `go.mod`/`go.sum` and runs `go mod download` before copying the rest (`backend/Dockerfile`, read)
- [ ] Builds `./cmd/server` and `./cmd/migrate` with `CGO_ENABLED=0`, `GOTOOLCHAIN=local` (`backend/Dockerfile`, read)
- [ ] Runtime has `/app/server`, `/app/migrate`, `/app/migration/` with all files of `backend/migration/`, `WORKDIR /app` (`backend/Dockerfile`, compare file list)
- [ ] `USER 65532:65532`; exec-form `ENTRYPOINT ["/app/server"]`, no CMD (`backend/Dockerfile`, read)
- [ ] Only `ENV HTTP_ADDR=:8080`; `EXPOSE 8080` (`backend/Dockerfile`, read)
- [ ] No secret/password/token/connection string in either file (both, grep)
- [ ] Header comment holds build, run, migrate commands in full, no-secrets/no-migrate-at-start note, and the `--env-file` caution (`backend/Dockerfile`, read)
- [ ] `.dockerignore` patterns in the given order, none of the kept paths; `COPY --chown=65532:65532` for `migration/` (`backend/.dockerignore`, `backend/Dockerfile`, read)
- [ ] `make check` passes; only the two files and this plan changed (`git diff --stat`)
- [ ] `make test-integration-local` (task touches `backend/`): outcome pending
