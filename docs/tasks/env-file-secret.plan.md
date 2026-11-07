# Plan: env-file-secret

Branch: `claude/env-file-secret`. Backend only. One item per acceptance criterion in `docs/tasks/env-file-secret.md`; tick when done and tested. All tests are unit tests in `backend/internal/platform/config/envfile_test.go`; none needs a database and none is an integration test.

## Findings before coding

- Prerequisite met: `STACK.md` names `github.com/joho/godotenv` at `v1.5.1` and describes `ENV_FILE`.
- Branch: the session assigned none (I was on `main`); the user told me to create `claude/env-file-secret` from `main`.

## LoadEnvFile (`internal/platform/config/envfile.go`, test `envfile_test.go`)
- [ ] `ENV_FILE` unset, and set to empty: `nil`, nothing set, a `.env` in the working directory is not read — test `TestLoadEnvFile` subtests `unset`, `empty`
- [ ] A key `ENV_FILE=<other>` in the file: `nil`, real `ENV_FILE` unchanged — subtest `env_file_key_not_followed`
- [ ] `KEY=VALUE`, blank, comment, `export`, double-quoted and single-quoted lines — subtest `parses_the_documented_forms`
- [ ] Real environment wins; unset is filled; set-to-empty is filled — subtest `real_environment_wins`
- [ ] Single-quoted `$ENVFILE_TEST_X`, ` # not a comment`, `pa$word` set byte for byte — subtest `single_quotes_keep_values_untouched`
- [ ] Unquoted value followed by ` # comment` set without the comment — subtest `unquoted_inline_comment`
- [ ] Missing file and a directory: error starts `ENV_FILE: cannot read the file:`, contains the path, nothing set — subtests `missing_file`, `directory`
- [ ] Malformed file with a bad key name: exact fixed parse message, no value fragment, valid lines not set — subtest `bad_key_name`
- [ ] Malformed file with an unterminated quote: same assertions — subtest `unterminated_quote`
- [ ] Empty name (`=top-secret-ddd`) and bare letters word: exact setenv message, no fragment; bare word with hyphen: fixed parse message — subtests `empty_name`, `bare_word`, `bare_word_with_hyphen`
- [ ] No `log`, `fmt.Print`, `fmt.Fprint`, `os.Stderr`/`os.Stdout` in the loader — `envfile.go` (verifier reads)
- [ ] `.env.example` block, Dockerfile header block (comments only) and package-comment sentence — `.env.example`, `backend/Dockerfile`, `internal/platform/config/config.go` (verifier reads)

## Wiring and repo-wide
- [ ] `main.go` calls `config.LoadEnvFile()` first, before `config.Load()`, nothing else changed — `cmd/server/main.go`
- [ ] `go.mod` gains only the godotenv `require` line; `go.sum` only its lines — `backend/go.mod`, `backend/go.sum`
- [ ] `make check` passes — outcome: not yet run
- [ ] `make test-integration-local` (should be unaffected) — outcome: not yet run

## Judgment calls
(filled in at the end)
