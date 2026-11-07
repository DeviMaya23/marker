# Task: Env file from a mounted secret

Backend only. One builder agent on its own branch; a separate verifier then checks it. Read `CLAUDE.md` first and follow its reference table. This file adds to those rules and does not replace them.

## Prerequisite

`STACK.md` names `github.com/joho/godotenv` at `v1.5.1` and its Deployment section says the server can read a mounted env file named by `ENV_FILE`. The user makes both edits before the task runs. If `STACK.md` does not name that library and version, stop and ask; do not pick another library or version.

## Goal

Cloud Run bills Secret Manager per active secret version, so one secret that holds a whole env file (`KEY=VALUE` lines) costs less than one secret per setting. Cloud Run can mount such a secret as a file. After this task the server can read that file at startup: when the environment variable `ENV_FILE` names a file, every `KEY=VALUE` line in it whose variable is not already set (to a non-empty value) in the real environment is set before `config.Load` runs. The image stays distroless (no shell, no entrypoint change), and the server's settings code does not change.

The file holds secrets, so the main requirement is that none of its content ever reaches a log or an error message. godotenv's own parse errors echo file content (a bad key name echoes the rest of the file from that line; an unterminated quote echoes the whole line), and `cmd/server` prints startup errors with `log.Fatalf`, so the loader must never pass a parse error on.

Requirements covered: none numbered. It serves the deployment in `STACK.md`. The verifier reports against this file and `STACK.md`, Deployment, and says that no requirement ID covers it.

Out of scope, with the reason for each:
- Creating the secret, mounting it on Cloud Run, setting `ENV_FILE` there, and checking Secret Manager pricing: deployment, done by the user.
- `cmd/migrate`: it runs in the `Migrate` GitHub Actions workflow with `DATABASE_URL` as a repository secret and needs no file.
- Changing which settings exist, their defaults or `Config.Validate`.
- A second file, a directory of files, or file watching and reloading: one file, read once at start.
- Any change to the Dockerfile's instructions. Only its header comment changes (below).
- `docs/**` and `STACK.md`: the user keeps them current.

## Role and ownership

Role: Backend, see `AGENTS.md`.

You may change `backend/**` except `backend/migration/` and `backend/internal/api/` (generated), and, as a special case that this task grants beyond the role table in `AGENTS.md`, `.env.example` at the repository root (one commented block, below). You may not change `openapi.yaml`, `oapi-codegen.yaml`, `docs/**` (except your own plan file, `docs/tasks/env-file-secret.plan.md`, see `AGENTS.md`), `STACK.md`, `CONVENTIONS.md`, the frontend, migrations, the Makefile or `docker-compose.yml`.

Shared files: this task changes `cmd/server/main.go`, `internal/platform/config/config.go` (its package comment only), `backend/go.mod` and `backend/go.sum`, and adds files in `internal/platform/config/`. It does not run together with any other task that changes `main.go`, `config.go`, `go.mod`, `go.sum` or `backend/Dockerfile`. Frontend tasks can run alongside.

## Operations used

None. No operation changes, and the contract is not edited.

## Behavior

### The loader

New exported function `LoadEnvFile() error` in the package `internal/platform/config`, in a new file `envfile.go`. It takes no arguments and reads `ENV_FILE` itself, so the whole behavior can be tested with `t.Setenv`. In order:

1. `path := os.Getenv("ENV_FILE")` (a relative path is resolved against the process's working directory, `/app` in the image). If it is the empty string (unset, or set to empty), return `nil` and do nothing. This is the default, so local development, `make` and every existing test are unchanged. No trimming: a value of spaces is a path and fails at step 2.
2. Read the whole file with `os.ReadFile(path)`. On any error return `fmt.Errorf("ENV_FILE: cannot read the file: %w", err)`. The standard library's error holds the path and the reason (`open /secrets/env: no such file or directory`, `read /secrets/env: is a directory`), never content, so it may be shown. A missing or unreadable file is fatal on purpose: with `ENV_FILE` set, a server that starts without its settings is worse than one that does not start.
3. Parse the bytes with `godotenv.UnmarshalBytes(data)`. Use only this function: not `godotenv.Load`, `Read`, `Parse` or `Exec`, which read the file themselves or run commands. If it returns an error, discard that error without formatting it, wrapping it or logging it, and return exactly `errors.New("ENV_FILE: the file is not valid KEY=VALUE lines (the parser's message is not shown because it can contain secret values)")`. No line number, no key, no fragment.
4. Only after the whole file parsed, for each key and value: if `os.Getenv(key)` is not the empty string, skip it (the real environment wins); otherwise `os.Setenv(key, value)`. A variable set to the empty string counts as unset, so the file fills it. This is the same rule `config.getenv` uses (an empty value means unset), so a stray empty variable in the environment cannot hide a value from the file, for example an empty `PROXY_SHARED_SECRET` turning the proxy check off. Do not use `os.LookupEnv` here. If `Setenv` fails, return `errors.New("ENV_FILE: cannot set a variable from the file")` with no key and no value in it. A parse failure therefore sets nothing.
5. Return `nil`. Log nothing on success or failure: the function calls no `log`, `fmt.Print*` or `os.Stderr` writer. It does not log names or counts.

A key named `ENV_FILE` inside the file is treated like any other key and is not followed.

### What the file may contain (godotenv's rules, which the docs line below must state)

`KEY=VALUE` lines, blank lines, `#` comment lines, an optional `export ` prefix. Surrounding single or double quotes are removed, unlike `docker --env-file`, so this file is a different file from the one given to `--env-file`. Three traps, all from godotenv: an unquoted or double-quoted value is scanned for `$NAME` and `${NAME}` references (an upper-case name such as `$ABC` is replaced by that name's value from earlier lines of the same file, or by nothing); an unquoted value ends at a space followed by `#`; and in a double-quoted value a backslash is removed (`\n` becomes a line break, `\x` becomes `x`). A value that contains `$`, ` #` or a backslash must therefore be in single quotes, which godotenv leaves untouched. Also accepted by godotenv, and harmless: `:` as a separator instead of `=`. A line with no `=` and only letters, digits, `_` or `.` (for example `topsecreteee`) is read as an empty name with that word as its value, which step 4 rejects; a line with no `=` that has any other character (for example `-`) is a parse error, which step 3 reports.

### Wiring

`cmd/server/main.go`: the first statements of `main`, before `config.Load()`:

```
if err := config.LoadEnvFile(); err != nil { log.Fatalf("config: %v", err) }
```

(written in the repository's formatting; the shape is what matters). No other change to `main.go`. The existing `log.Fatalf("config: %v", err)` style is kept, which is safe only because of steps 2 to 4 above.

`internal/platform/config/config.go`: the package comment gains one sentence saying that `LoadEnvFile` can first fill unset variables from the file named by `ENV_FILE`. Nothing else in that file changes.

`.env.example`: a commented block, placed after the `PROXY_SHARED_SECRET` block: the variable (`# ENV_FILE=`), and a few comment lines saying it is the path of a `KEY=VALUE` file read at startup for variables that are not already set; that it is for a secret mounted as a file in production; that `make` already loads `.env`, so leave it unset locally; and the quoting rule above (single quotes for a value with `$`, ` #` or a backslash) in one sentence.

`backend/Dockerfile`: comments only, no instruction changes. Add a block to the header comment, after the line "The image holds no secrets, and the server does not migrate at start.", that contains, written out in full: that settings can also come from a file named by `ENV_FILE`, read at startup, with real environment variables taking precedence; the local command `docker run --rm -p 8080:8080 -v <env file>:/secrets/env:ro -e ENV_FILE=/secrets/env marker-backend` (the mounted file must be readable by user 65532, for example mode `0644`; this file's values are quoted as godotenv expects, not as `--env-file` expects); the Cloud Run form `--set-secrets=/secrets/env=<secret>:latest --set-env-vars=ENV_FILE=/secrets/env`, marked as the user's deployment step and not tested by the author; and the single-quote rule (`$`, ` #`, backslash). The block also says that the existing caution about `HTTP_ADDR` applies to `--env-file` only: a variable in the `ENV_FILE` file never overrides one the container already has, `HTTP_ADDR` included.

### Known gaps

- Nothing here was run against Cloud Run. Whether the mounted file is readable by user 65532, and whether a new secret version reaches the server (it is read once at start, so a new version needs a new instance), are for the user to confirm on the first deployment.
- The parse error has no line number, on purpose. Finding a typo in the secret means reading the file.
- The file is read whole, with no size cap. Secret Manager limits a version to 64 KiB.
- `$NAME` expansion and the ` #` comment rule are godotenv's behavior, not ours; the docs line and the single-quote rule are the guard. Tests pin only the single-quote guard.
- The saving is the user's to measure: the user has checked Secret Manager pricing and the cost is not zero, so one secret instead of one per setting (`DATABASE_URL`, `OIDC_CLIENT_SECRET`, `AUTH_STATE_SECRET`, `PROXY_SHARED_SECRET`) is worth doing. Nothing in this task depends on the amount.
- Anyone who can read the file inside the container can read the secrets, exactly as with environment variables.
- `cmd/migrate` does not read `ENV_FILE`.

## Structure

By `ARCHITECTURE.md`:

- `internal/platform/config/envfile.go`: `LoadEnvFile`, with a doc comment that says what it does, that it must run before `Load`, and why parse errors are discarded. Imports godotenv only here.
- `internal/platform/config/envfile_test.go`: the tests below.
- `cmd/server/main.go`, `config.go` (package comment), `.env.example`, `backend/Dockerfile` (comments): as above.
- `backend/go.mod` and `backend/go.sum`: add the one `require` line for `github.com/joho/godotenv v1.5.1` and its `go.sum` lines (`go get github.com/joho/godotenv@v1.5.1`, then `go mod tidy`). The `go` directive and every other line must not change; if `go get` or `tidy` changes anything else, stop and ask.

## Dependencies

`github.com/joho/godotenv v1.5.1`, named in `STACK.md` (see Prerequisite). Standard library otherwise. godotenv has no dependencies of its own.

## Acceptance criteria

All unit tests; none needs a database and none is an integration test (say so in the report). Tests run sequentially (`t.Setenv` forbids `t.Parallel`). Use variable names that are unique to the tests (for example `ENVFILE_TEST_A`), and where a test lets the loader set a variable that was not set before, register `t.Cleanup(func() { os.Unsetenv(name) })` so it does not leak into other tests.

**`LoadEnvFile` (`envfile_test.go`)**
- `ENV_FILE` unset, and `ENV_FILE` set to empty: returns `nil` and sets nothing (also with a `.env` file in the working directory, which the loader must not read).
- A file that contains `ENV_FILE=<another path>` while the real `ENV_FILE` points at the file: returns `nil`, the real `ENV_FILE` keeps its value, and the file is not followed (the test can show only that the call returns `nil` and that `ENV_FILE` is unchanged).
- A file with `KEY=VALUE` lines, blank lines, comment lines, an `export ` line, a double-quoted value and a single-quoted value: returns `nil` and each variable has the expected value, quotes removed.
- The real environment wins: a variable already set to `real` stays `real` when the file says otherwise; a variable not set is set from the file; a variable set to the empty string (`t.Setenv(name, "")`) is set from the file.
- A single-quoted value holding `$ENVFILE_TEST_X`, ` # not a comment` and `pa$word` is set byte for byte.
- An unquoted value followed by ` # comment` is set without the comment.
- Missing file: the error starts `ENV_FILE: cannot read the file:`, contains the path, and nothing is set. A directory as the path gives the same prefix.
- A malformed file made of a valid first line, a line with a bad key name (`bad-key!=top-secret-bbb`), and a valid last line with a recognisable secret value: the error is exactly the fixed parse message, contains none of the file's value fragments (check each one), and the variables of the valid lines are not set.
- A second malformed file with an unterminated quote (`A="top-secret-ccc` as the last line of the file, with no other `"` after it, because the parser closes the quote at the next `"` anywhere later in the file): same assertions.
- A file with a line that has an empty name (`=top-secret-ddd`), and a file with a bare word of letters only and no `=` (`topsecreteee`): godotenv parses both as an empty name, so the error is exactly the setenv message (`ENV_FILE: cannot set a variable from the file`) and contains no value fragment. A bare word with a hyphen (`top-secret-eee`) is a parse error instead: the error is exactly the fixed parse message.
- The loader's source calls no `log`, `fmt.Print`, `fmt.Fprint` or write to `os.Stderr` or `os.Stdout`: checked by the verifier by reading (below), not by a test.
- The `.env.example` block, the Dockerfile comment block and the package-comment sentence have the content listed under "Wiring": checked by the verifier by reading (below), not by a test.

**Repo-wide**
- `make check` passes.
- `backend/go.mod` changes only by the one added `require` line, `backend/go.sum` only by its lines, and nothing outside the allowed paths changed. `backend/Dockerfile` changes only in comment lines.

## Verifier checks

- Diff touches only the allowed paths. In `git diff backend/Dockerfile` every added or removed line starts with `#` (ignore the context, `---`, `+++` and `@@` lines). `backend/go.mod` differs from `main` by exactly one added line, and `backend/go.sum` only by added lines for godotenv.
- `git grep -n godotenv -- '*.go'`: imported only in `envfile.go` (and its test, if used there); no `godotenv.Load`, `godotenv.Overload`, `godotenv.Read`, `godotenv.Parse` or `godotenv.Exec` anywhere (a bare grep for `Load` matches `config.Load`, which is fine).
- Read the `.env.example` block, the Dockerfile header block and the package comment against "Wiring": each item listed there is present (both docker commands written out, the `0644` and user 65532 note, the single-quote rule with its three cases, the `--env-file` caution about `HTTP_ADDR`).
- Read `envfile.go`: the error from `UnmarshalBytes` is never formatted, wrapped, logged or returned; the file's bytes and the parsed values appear in no `fmt.Errorf`, log call or error; no log or print call exists in the file; parsing finishes before the first `Setenv`.
- Read `main.go`: `LoadEnvFile` is called before `config.Load()`, and nothing else in `main.go` changed.
- Break each behavior and see its test fail, then revert: return the parser's error (the secret-fragment test), wrap it with `%w`, set variables while parsing (the "nothing is set" assertion), make the file override the environment (the real-environment test), switch to `LookupEnv` so set-but-empty counts as set (the empty-string test), ignore a missing file.
- Run the new tests with `-race` and `-count=5`.
- Inputs to try: a CRLF file; a file with a UTF-8 byte order mark; an empty file; a file of only comments; a 64 KiB file; `ENV_FILE` pointing at `/dev/null`; a value with `=` inside it; a duplicate key (the last line wins in godotenv; report it, do not change it); a file whose path is a named pipe is not tried. For the byte order mark, report what happens (godotenv is expected to reject the first key, so the fixed parse message); do not add handling for it.

## Stop and ask when

- The contract (`openapi.yaml`), a requirement, or this file conflict with each other.
- You think you need a change outside your paths, a dependency beyond the one named, a migration, or an edit to a spec file.
- A convention in `CONVENTIONS.md` seems to prevent what this file asks for.
- `go get` or `go mod tidy` changes `backend/go.mod` beyond the one `require` line (including the `go` directive).
- `godotenv.UnmarshalBytes` is missing from v1.5.1 or returns a different type than `(map[string]string, error)`.

Do not improvise around these. Report what blocked you and what you did not do.

## Handing back

Follow `AGENTS.md`: run `make check`, run `make test-integration-local` (it should be unaffected; report whether it ran and the Postgres version), commit in small steps, push your branch (never `main`), and finish with a short report with the branch name, what changed, requirement IDs covered (none; say so), the dependency version added, and anything you were unsure about. Also note every place you made a judgment call that this file did not settle. List the steps the user must do: create the secret from an env file written with godotenv's quoting rules, mount it on Cloud Run with `ENV_FILE` set, confirm the file is readable by the container user, and check the first start in the logs shows no secret content.
