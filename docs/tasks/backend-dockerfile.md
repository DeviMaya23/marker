# Task: Backend Dockerfile

Backend only, and it adds no Go code: two new files. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

`STACK.md` names the two base images this task uses: `golang:1.26` (build stage) and `gcr.io/distroless/static-debian12:nonroot` (runtime stage). The user adds that line to `STACK.md` before the task runs. If `STACK.md` does not name both, stop and ask; do not pick other images.

## Goal

The backend can be built into a container image that runs on Google Cloud Run (`STACK.md`, Deployment). One image holds both programs: the server (`cmd/server`) and the migration tool (`cmd/migrate`), plus the SQL migration files the tool reads from disk. The server is the image's default command; the migration tool is run as a separate step before each release, from the same image.

Requirements covered: none numbered. It serves the deployment in `STACK.md`. The verifier reports against this file and `STACK.md`, and says that no requirement ID covers it.

Out of scope, with the reason for each:
- Running Docker: the builder cannot, and the verifier cannot either. The user builds and runs the image. Everything below that needs a container run is a step for the user.
- Cloud Run service settings, Artifact Registry, a CI job that builds the image, secrets, Neon: deployment, done by the user.
- The Worker and `frontend/public/_redirects` (backlog, "Later").
- A `Makefile` target for the image, and any change to `docker-compose.yml` (which is only for the local database).
- Multi-architecture images. Cloud Run runs `linux/amd64`; the build command in the comment below says so.
- A `HEALTHCHECK` instruction: the runtime image has no shell or `curl`, and Cloud Run uses its own probe on `GET /healthz`.
- Running migrations when the server starts: `STACK.md` says the server does not migrate at start.

## Role and ownership

Role: Backend, see `AGENTS.md`.

You may add `backend/Dockerfile` and `backend/.dockerignore`. You may not change any other file: no Go code, no tests, `go.mod`, `go.sum`, `.env.example`, the `Makefile`, `docker-compose.yml`, `STACK.md`, `docs/**` (except your own plan file, `docs/tasks/backend-dockerfile.plan.md`, see `AGENTS.md`), the contract, migrations or the frontend.

Shared files: none. The build context is the `backend/` directory (`docker build backend`), because `go.mod` lives there, so the image build needs nothing from the repository root. This task can run alongside any other task.

## Operations used

None.

## Behavior

### Facts the Dockerfile rests on (all on `main`)

- `go.mod` says `go 1.26.0`; the programs are `backend/cmd/server` and `backend/cmd/migrate`, both pure Go (pgx, no cgo).
- `cmd/migrate` takes `-dir` (default `migration`, relative to the working directory) and reads the numbered `.sql` files from that folder at run time; it reads `DATABASE_URL` from the environment and then also applies River's migrations. The files are in `backend/migration/`.
- The server reads all settings from the environment (`internal/platform/config`). `HTTP_ADDR` defaults to `:8085`; Cloud Run sends traffic to port 8080 by default. `APP_ENV` defaults to `development`.
- `GET /healthz` answers `200` with no dependencies.

### `backend/Dockerfile`

Two stages.

**Build stage** (`FROM golang:1.26 AS build`):
- `GOTOOLCHAIN=local` in the environment, so a toolchain older than `go.mod` fails the build instead of downloading another one.
- Copy `go.mod` and `go.sum` first and run `go mod download`, then copy the rest of the context, so the dependency layer is cached until `go.mod` or `go.sum` change.
- Build both programs with `CGO_ENABLED=0`, `-trimpath` and `-ldflags="-s -w"`, into `/out/server` and `/out/migrate` (`go build -o /out/server ./cmd/server`, and the same for `./cmd/migrate`).

**Runtime stage** (`FROM gcr.io/distroless/static-debian12:nonroot`):
- `WORKDIR /app`.
- Copy `/out/server` and `/out/migrate` from the build stage into `/app/`, and the `migration` folder from the build context (not from the build stage) into `/app/migration/` with `COPY --chown=65532:65532`, so the non-root user can read the files whatever their mode in the checkout. With the working directory `/app`, the migration tool's default `-dir migration` finds them; do not pass or set another path.
- Run as the numeric non-root user: `USER 65532:65532` (the image's `nonroot` user).
- `ENV HTTP_ADDR=:8080` and `EXPOSE 8080`. This is the only `ENV` the image sets. In particular it sets no `APP_ENV` (the deployment sets `APP_ENV=production`; the server refuses to start in production without its secrets) and no secret of any kind.
- `ENTRYPOINT ["/app/server"]` in exec form, no `CMD`.
- No `ARG` that carries a value used at run time, no `ADD` from a URL, no tag `latest`, no `curl` or package installation.

**Header comment in the Dockerfile** (plain comments, the only place the instructions live, since `docs/**` is off limits). It must contain these four things; the wording is yours, but each command must be written out in full:
- Build, from the repository root: `docker build --platform linux/amd64 -t marker-backend backend`.
- Run the server: `docker run --rm -p 8080:8080 --env-file <env file> marker-backend`, settings from the environment.
- Run migrations, as a separate step before each release, against Neon's direct (non-pooled) connection string: `docker run --rm --entrypoint /app/migrate -e DATABASE_URL=<direct connection url> marker-backend` (no arguments needed: the working directory is `/app`, where `migration/` is).
- That the image holds no secrets and the server does not migrate at start.
- A caution on the run command: the env file must not set `HTTP_ADDR` to anything but `:8080` (it overrides the image's value, and the repository's `.env.example` sets `:8085`), and its `DATABASE_URL` must be reachable from inside the container (`localhost` there is the container itself). `docker --env-file` does not strip quotes the way `make` does, so write the values without quotes.

### `backend/.dockerignore`

One pattern per line, with a short comment for each group. It excludes, in this order: `.git`, `.env`, `.env.*`, then `!.env.example` (the negation must come after the patterns it re-includes), then `**/bin/`, `**/*.test`, `**/*.out`, `coverage.txt`, `Dockerfile` and `.dockerignore`. The `**/` forms make the patterns recursive, as the root `.gitignore` semantics are (a bare `*.test` in `.dockerignore` matches only the context root). It must not exclude `migration/`, `go.mod`, `go.sum`, `cmd/`, `internal/` or `pkg/`. Go test files are not excluded (the build ignores them, and a pattern for them adds a way to break the build for no gain).

### Known gaps

- Nothing in this task builds or runs the image. A mistake in the file shows up when the user builds it.
- A container started without `APP_ENV=production` runs in development mode: dev login stays off unless `AUTH_DEV_LOGIN=true` is set (the server refuses that in production). The deployment must set `APP_ENV`, `APP_BASE_URL`, `DATABASE_URL`, the `OIDC_*` settings and `AUTH_STATE_SECRET`, and, once the `proxy-secret` task has merged, `PROXY_SHARED_SECRET` and `CLIENT_IP_HEADER`.
- The build stage uses a floating minor tag (`golang:1.26`), so a rebuild may pick up a newer patch release of Go. Pinning a digest is not part of this task.
- The in-process fetch queue and the rate limits assume one instance (`STACK.md`, Deployment); the image does not enforce it.
- The migration files are copied from the build context, so the migration files in an image always match the code in it, but a migration run uses the image you run it from: run it from the image of the release you are deploying.

## Structure

Two files, `backend/Dockerfile` and `backend/.dockerignore`. No Go code, no new directory.

## Dependencies

The two base images above, named in `STACK.md`. No Go or npm dependency changes; `go.mod` and `go.sum` are unchanged.

## Acceptance criteria

No test framework covers a Dockerfile and agents cannot run Docker, so these are checked by reading the two files, plus the one Go command that can run. The builder says in the report that the image was not built.

- `CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o <a temporary folder outside the repository> ./cmd/server ./cmd/migrate` (run in `backend/`) succeeds, so the flags the Dockerfile uses build both programs. (Create the temporary folder first, since `-o <dir>` with two packages needs it to exist; report the result; commit no binary.)
- The Dockerfile has exactly two stages, in the order above, using only the two images named in `STACK.md` (no tag `latest`, no other `FROM`).
- The build stage copies `go.mod` and `go.sum` and runs `go mod download` before it copies the rest of the context.
- It builds `./cmd/server` and `./cmd/migrate` with `CGO_ENABLED=0` and sets `GOTOOLCHAIN=local`.
- The runtime stage contains `/app/server`, `/app/migrate` and `/app/migration/` with every file that is in `backend/migration/` on this branch (compare the list), with `WORKDIR /app`.
- `USER` is the numeric `65532:65532`; the entrypoint is exec-form `/app/server`.
- The only `ENV` is `HTTP_ADDR=:8080`; `EXPOSE 8080`.
- No secret, password, token or connection string appears in either file (the placeholders in the header comment are angle-bracket names, not values).
- The header comment contains the build, run and migrate commands in full and the `--env-file` caution; none of them is paraphrased away.
- `.dockerignore` excludes the patterns listed, in the order given, and none of the paths it must keep. The runtime stage copies `migration/` with `--chown=65532:65532`.
- `make check` passes, and nothing outside the two new files (and the plan file) changed.

## Verifier checks

- Read both files against the lists above. The verifier cannot build the image: say so, and do not mark anything "verified by build".
- Check that the paths in the Dockerfile exist in the repository: `backend/go.mod`, `go.sum`, `cmd/server`, `cmd/migrate`, `migration/`.
- Re-run the one Go command above.
- Cross-check against the code: `cmd/migrate/main.go` default `-dir` is `migration`; `config.Load` default for `HTTP_ADDR`; `/healthz` exists in `handler/router.go`. A mismatch is a finding.
- Look for these mistakes: a `COPY` that puts `migration/` somewhere the default path does not find; a wrong `WORKDIR`; running as root; `ENV` values that are secrets; `.dockerignore` that removes `migration/` or `go.sum`; a `FROM` with `latest`.
- Confirm no other file changed (`go.mod`, `go.sum`, the `Makefile`, `.env.example`).

## Stop and ask when

- `STACK.md` does not name both base images.
- The contract, a requirement, or this file conflict with each other.
- You think you need a change outside the two files, a dependency, a migration, or an edit to a spec file.
- `go build` with `CGO_ENABLED=0` fails for either program.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, the result of the one `go build` command, that the image was **not** built or run, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. List the steps the user must do: build the image (the command in the Dockerfile's header comment), run the migration step against a database, start the server with the environment settings, and call `GET /healthz`.
