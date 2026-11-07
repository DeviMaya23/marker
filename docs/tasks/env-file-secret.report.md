# Verification report: env-file-secret

Branch: `claude/env-file-secret` (the builder's branch; this session started on it, head `6debd03`, equal to `origin/claude/env-file-secret`).

Result: **no Blocking findings.** `make check` passes (exit 0; only the 7 existing Redocly `tag-description` warnings). No requirement ID covers this task; it is checked against `docs/tasks/env-file-secret.md` and `STACK.md`, Deployment. All tests are unit tests; none needs a database and none is an integration test. I added no tests and changed no source.

Integration tests: **not run**: `make test-integration-local` stops with "no PostgreSQL server binaries found under /usr/lib/postgresql/*/bin" (macOS machine, no PostgreSQL printed). The task does not touch repositories, so no criterion depends on them.

## 1. Acceptance criteria

All in `backend/internal/platform/config/envfile_test.go`, test `TestLoadEnvFile`, subtest names abbreviated. "Real" means the test fails without the behavior (see mutations in section 3).

| Criterion | Test | Real? | Status |
|---|---|---|---|
| Unset and empty `ENV_FILE`: `nil`, nothing set, `.env` not read | `unset does nothing…`, `empty does nothing…` | Real for "not read" (a `.env` with a marker var sits in the cwd; `godotenv.Load` would set it) | Met |
| `ENV_FILE` key inside the file is not followed | `an ENV_FILE key in the file is not followed` | Real: failed when the file was allowed to override the environment (M3) | Met |
| Forms: `KEY=VALUE`, blank, comment, `export`, double and single quotes | `parses the documented forms` | Real | Met |
| Real environment wins; unset filled; empty filled | `the real environment wins, empty counts as unset` | Real: fails under M3 and under `LookupEnv` (M4) | Met |
| Single-quoted `$ENVFILE_TEST_X`, ` # not a comment`, `pa$word` byte for byte | `single quotes keep the value byte for byte` | Real | Met |
| Unquoted value then ` # comment` | `an unquoted value ends before a space and hash` | Real | Met |
| Missing file and directory: prefix, path, nothing set | `a missing file or a directory…` | Real: fails if the read error is ignored (M5) | Met |
| Bad key name: exact fixed message, no fragment, valid lines not set | `a parse error shows only the fixed message: a bad key name` | Real: fails if the parser error is returned (M1) or wrapped (M2) | Met |
| Unterminated quote: same | `…: an unterminated quote` | Real (same mutations) | Met |
| Empty name and letters-only bare word: exact setenv message, no fragment; hyphen bare word: parse message | `a setenv failure…: an empty name / a bare word without hyphen`, `…parse error…: a bare word with hyphen` | Real | Met |
| No log/print/stderr in the loader | by reading | `grep` finds `log.` only in the doc comment (line 16) | Met |
| `.env.example` block, Dockerfile block, package-comment sentence | by reading | see section 3 | Met |
| `make check` passes | run | exit 0 | Met |
| `go.mod`, `go.sum`, Dockerfile, allowed paths | by diff | see section 3 | Met |

Test hygiene: new variable names are unique (`ENVFILE_TEST_*`), cleanups unset them, no `t.Parallel`, the tests are in the one existing test file for `envfile.go`. `-race -count=5` on the package: passed.

## 2. Plan check

I read `docs/tasks/env-file-secret.plan.md` after section 1.

- Every criterion in the task file has a plan item. None missing.
- Every ticked item has a test or a reading target that exists and checks the behavior.
- Differences between plan and diff (Non-blocking): the plan names subtests such as `env_file_key_not_followed`, `bad_key_name`, `missing_file`; the file has different, descriptive names (and the missing-file and directory cases are one subtest). Behavior is the same.
- The plan's judgment call on the bare word is accurate: in godotenv v1.5.1 a letters-only bare word reaches the setenv message only as the last line with no trailing newline (I confirmed: with a trailing newline it is the parse message). The test uses the no-newline form, as the plan says.
- The plan says the integration run was "not run: no PostgreSQL binaries"; I got the same result.

## 3. Rule checks

- Only `handler/` imports `internal/api`: no change near it. Met.
- Repository queries filter by `user_id`; `users.version` incremented in write transactions: no repository or write path touched. Not applicable.
- Diff touches only allowed paths: `.env.example`, `backend/Dockerfile`, `backend/cmd/server/main.go`, `backend/go.mod`, `backend/go.sum`, `config.go`, `envfile.go`, `envfile_test.go`, and the plan file. Met.
- `git diff main -- backend/Dockerfile`: every added line starts with `#`; no removed lines. Met.
- `go.mod`: exactly one added line, `github.com/joho/godotenv v1.5.1`; `go`/`toolchain` lines unchanged. `go.sum`: two added godotenv lines. Met.
- `git grep godotenv -- '*.go'`: imported only in `envfile.go`; only `godotenv.UnmarshalBytes` is called; no `Load`, `Overload`, `Read`, `Parse` or `Exec`. Met.
- `.env.example`: `# ENV_FILE=` placed after the `PROXY_SHARED_SECRET` block, with the path/read-at-start/unset-only purpose, the production-secret purpose, "`make` already loads .env, so leave this unset locally", and the single-quote rule for `$`, `" #"` and backslash. Met.
- `backend/Dockerfile` header: placed after "The image holds no secrets…"; says settings can come from `ENV_FILE`, environment wins; the full local `docker run` command; mode `0644` and user 65532; the Cloud Run `--set-secrets` / `--set-env-vars` form marked as the user's step, not tested; the single-quote rule with its cases; the note that the `HTTP_ADDR` caution applies to `--env-file` only. Met.
- Package comment: one added sentence in `config.go`. Met.
- `envfile.go`: the `UnmarshalBytes` error is never formatted, wrapped, logged or returned (the `err` is only compared with nil); the file bytes and values appear in no error; no log or print call; parsing finishes before the first `Setenv`; `getenv`-style empty-means-unset rule is used (`os.Getenv`, not `LookupEnv`). The read error uses `%w` on the standard library error, as the task asks. Met.
- `main.go`: `config.LoadEnvFile()` is the first statement, before `config.Load()`, with the `log.Fatalf("config: %v", err)` shape; nothing else changed. Met.

Mutations (each applied, tests run, reverted; `git status` clean afterward):

| Mutation | Result |
|---|---|
| M1 return the parser's error | 3 parse-error subtests fail |
| M2 wrap it with `%w` | the same 3 fail |
| M3 file overrides the environment | the `ENV_FILE`-not-followed and real-environment subtests fail |
| M4 `LookupEnv` instead of `Getenv` | the real-environment (empty) subtest fails |
| M5 ignore a read error | the missing-file subtest fails |
| M6 set variables while parsing | not applied: `UnmarshalBytes` parses the whole file in one call, so there is no loop to mutate. The "valid lines not set" assertions in the parse-error subtests cover a regression that parses and sets line by line. |

## 4. Edge inputs

Run once with a temporary test (deleted afterward; not added to the repo):

| Input | Result |
|---|---|
| CRLF file | values set without `\r` |
| UTF-8 byte order mark | fixed parse message, nothing set (as the task file expects) |
| Empty file; only comments | `nil`, nothing set |
| 64 KiB file | `nil`, parsed |
| `ENV_FILE=/dev/null` | `nil` |
| `ENV_FILE` of spaces | `ENV_FILE: cannot read the file: open    : no such file or directory` (a path, as the task says) |
| Value with `=` inside (`a=b=c`) | set whole |
| Duplicate key | last line wins (`second`), godotenv's behavior; reported, not changed |
| Letters-only bare word followed by a newline | fixed parse message (the plan's judgment call) |

## 5. Findings

Blocking: none.

Non-blocking:
1. The plan's subtest names do not match the test file (section 2).
2. Setenv-failure cases (`=…`, bare word) do not assert that earlier valid lines were left unset. The task file only requires that for parse failures. In the code, valid keys earlier in map order may already be set when the empty-name key is reached (map iteration is random), so a setenv failure can leave some variables set. The task file's step 4 accepts this ("a parse failure therefore sets nothing"); the server exits in that case anyway.
