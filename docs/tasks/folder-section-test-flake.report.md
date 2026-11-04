# Verification report: folder-section-test-flake

Branch: `claude/folder-section-test-flake-verify-v578py` (reset to builder branch `claude/folder-section-test-flake-p8x83m` at 981a849, no verifier commits to source or tests).

**Result: no Blocking findings.**

`make check`: passed (exit 0). Redocly printed 7 pre-existing tag-description warnings in `openapi.yaml`; not related.

## Criteria

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `it.each` ends with `await waitFor(() => expect(where()).toBe(expected))` after the dialog wait; no bare `expect(where())` after it | Met | `FolderSection.test.tsx` ~l.204-205, diff vs `382b83f`. The dialog `waitFor` stays on the line before. |
| 2 | Six rows kept, same names and expected paths | Met | Diff touches only the comment and the last assertion; the table is unchanged. |
| 3 | No other test changes (unless item 4 applies) | Met | Diff is 2 lines in one test. Create / failed-delete / move assert "location unchanged"; history-replace already uses `waitFor`. No other test asserts a changing location without waiting. |
| 4 | 20 alone, 10 under full-suite load, full `make check` | Met | Alone 20/20. Loaded 10/10 with `npx vitest run` in a second shell (the full suite ran 15:25:56 to ~15:26:55; roughly the first 5 of the 10 runs overlapped it, the rest ran after). `make check` passed. No failures. |
| 5 | Nothing outside allowed paths changed | Met | `git diff 382b83f..HEAD --stat`: the test file and the plan only. No `go.mod`/`package.json` change. |

Discrimination check (task "Verifier checks"): replaced `navigate('/', { replace: true })` at `FolderSection.tsx:72` with `void 0`. Result: the three navigating rows (deleted folder, child, grandchild) failed, and so did "replaces the history entry instead of pushing one" (expected: it also needs the navigation). Reverted with `git checkout`; tree clean.

Does the test really exercise the behavior? Yes for the three navigating rows (shown by the mutation). The three "stay" rows pass on first try and could pass a late wrong navigation unseen; this is the task's stated Known gap, not a defect.

I could not reproduce the flake on `main`, so the fix is not proven by an observed before/after; the assertion no longer depends on timing. No fixed sleep, no raised timeout, no `retry` option added.

## Plan check

Plan: `docs/tasks/folder-section-test-flake.plan.md`.

- Criteria missing from the plan: none. It lists AC1 to AC5, which map to the five criteria above.
- Ticked items without a real test: none. Item 3 names tests that are meant to stay untouched, and they are.
- Plan vs diff: matches. The plan's note that the background suite may have finished before all 10 loaded runs matches what I saw.
- Plan says `make test-integration-local` was not run. `AGENTS.md` asks cloud sessions to run it. Non-blocking, as the task touches only a frontend test.

## Rule checks

- Only `handler/` imports `internal/api`: not applicable; no Go changed.
- Repository queries filter by `user_id`: not applicable.
- `users.version` incremented in write transactions: not applicable.
- `go.mod` go/toolchain and dependencies unchanged: yes (not in the diff).
- Verifier checks from the task file: diff limited to test + plan (yes); discrimination (done); race removal (20/20, 10/10); no sleep, timeout or retry (yes).

## Findings

Blocking: none.

Non-blocking:
1. Plan did not run `make test-integration-local` (see above); irrelevant to this change.
2. Of the 10 loaded runs, only about the first half overlapped the full suite (it took ~59 s). Weak load evidence, already disclosed by the builder.

## Integration tests

None exist for this task, and no criterion depends on them. I did not run any.
