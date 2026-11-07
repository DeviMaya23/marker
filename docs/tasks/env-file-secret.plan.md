# Plan: env-file-secret

Branch: `claude/env-file-secret`. Backend only. One item per acceptance criterion in `docs/tasks/env-file-secret.md`; tick when done and tested. All tests are unit tests in `backend/internal/platform/config/envfile_test.go`; none needs a database and none is an integration test.

## Findings before coding

- Prerequisite met: `STACK.md` names `github.com/joho/godotenv` at `v1.5.1` and describes `ENV_FILE`.
- Branch: the session assigned none (I was on `main`); the user told me to create `claude/env-file-secret` from `main`.

## LoadEnvFile (`internal/platform/config/envfile.go`, test `envfile_test.go`)
- [x] `ENV_FILE` unset, and set to empty: `nil`, nothing set, a `.env` in the working directory is not read — test `TestLoadEnvFile` subtests `unset`, `empty`
- [x] A key `ENV_FILE=<other>` in the file: `nil`, real `ENV_FILE` unchanged — subtest `env_file_key_not_followed`
- [x] `KEY=VALUE`, blank, comment, `export`, double-quoted and single-quoted lines — subtest `parses_the_documented_forms`
- [x] Real environment wins; unset is filled; set-to-empty is filled — subtest `real_environment_wins`
- [x] Single-quoted `$ENVFILE_TEST_X`, ` # not a comment`, `pa$word` set byte for byte — subtest `single_quotes_keep_values_untouched`
- [x] Unquoted value followed by ` # comment` set without the comment — subtest `unquoted_inline_comment`
- [x] Missing file and a directory: error starts `ENV_FILE: cannot read the file:`, contains the path, nothing set — subtests `missing_file`, `directory`
- [x] Malformed file with a bad key name: exact fixed parse message, no value fragment, valid lines not set — subtest `bad_key_name`
- [x] Malformed file with an unterminated quote: same assertions — subtest `unterminated_quote`
- [x] Empty name (`=top-secret-ddd`) and bare letters word: exact setenv message, no fragment; bare word with hyphen: fixed parse message — subtests `empty_name`, `bare_word`, `bare_word_with_hyphen`
- [x] No `log`, `fmt.Print`, `fmt.Fprint`, `os.Stderr`/`os.Stdout` in the loader — `envfile.go` (verifier reads)
- [x] `.env.example` block, Dockerfile header block (comments only) and package-comment sentence — `.env.example`, `backend/Dockerfile`, `internal/platform/config/config.go` (verifier reads)

## Wiring and repo-wide
- [x] `main.go` calls `config.LoadEnvFile()` first, before `config.Load()`, nothing else changed — `cmd/server/main.go`
- [x] `go.mod` gains only the godotenv `require` line; `go.sum` only its lines — `backend/go.mod`, `backend/go.sum`
- [x] `make check` passes — outcome: passed
- [x] `make test-integration-local` (should be unaffected) — outcome: not run: no PostgreSQL server binaries under /usr/lib/postgresql/*/bin on this macOS machine

## Judgment calls
- Branch: none assigned; created `claude/env-file-secret` from `main` at the user's instruction.
- Bare word without `=`: in godotenv v1.5.1 a letters-only word parses as an empty name only when it is the last line with no trailing newline. With a trailing newline it is a parse error (the fixed parse message). The test uses the no-newline form to reach the setenv message; both outcomes show no content.
- Tests use a few maps of cases, run as subtests, in the one test function `TestLoadEnvFile`, with the helper functions in the same file.
- `.env.example` and Dockerfile wording is mine; each item listed under "Wiring" is present.
