# Agent prompts

Paste one prompt per cloud session, in this order. Each stage starts from the branch the previous stage pushed (pick it as the base branch at claude.ai/code), and the session works on the branch it is given. Fill in the `<PLACEHOLDERS>` first.

| # | Stage | Base branch | Placeholders |
|---|---|---|---|
| 1 | Builder | `main` | none |
| 2 | Verifier, first pass | the builder's branch | `<BUILDER_BRANCH>` |
| 3 | Fix round (builder) | the verifier's branch | `<VERIFIER_BRANCH>`, `<ALREADY_FIXED>` |
| 4 | Verifier, second pass | the fix round's branch | `<FIX_BRANCH>` |

Stop rules: two verification rounds at most. Only Blocking findings are fixed in the round; Non-blocking ones go to `docs/tasks/backlog.md`.

---

## 1. Builder

```
Read CLAUDE.md, then complete the task in docs/tasks/save-a-url.md.

Work on the branch this session gives you. Don't create or switch to another branch, and never push to main. Before writing code, write your plan to docs/tasks/save-a-url.plan.md as a checklist: one item per acceptance criterion in the task file, each naming the file and test you will use. Commit it as your first commit. As you finish items, tick them. Then implement, commit in small steps, run `make check`, and push your branch.

Nobody is available to answer questions while you work. If a "Stop and ask" condition in the task file applies, stop, don't improvise, and say what blocked you. Otherwise settle small gaps with the most reasonable reading.

At the end, add a "Judgment calls" section to the plan file for anything the task file didn't settle. Finish with the report format in AGENTS.md ("Handing back"), plus the judgment calls. State your branch name at the top of the report.
```

---

## 2. Verifier, first pass

```
You are the verifier for the save-a-URL task. Read CLAUDE.md, AGENTS.md (Verifier role) and docs/tasks/save-a-url.md. Fetch and check out branch <BUILDER_BRANCH>. Work on the branch this session gives you, which starts from it. Never push to main.

You may add or fix tests and write a report. You may not change source code. If source is wrong, report it; don't fix it.

1. Run `make check`.
2. Go through every acceptance criterion in the task file. Name the test that covers it and say whether that test really exercises the behavior or could pass without it. Mark each criterion met, partly met or not met, with evidence (file, test name, requirement ID).
3. Only now read docs/tasks/save-a-url.plan.md. Flag any criterion that is missing from the plan, any ticked item whose test doesn't exist or doesn't check the behavior, and any difference between the plan and the diff. Judge the code against the task file, not against the plan.
4. Check the rules by reading the diff:
   - only handler/ imports internal/api;
   - every repository query filters by user_id, except the one allowed fetch lookup;
   - the fetch job is enqueued only after commit;
   - no outbound request bypasses pkg/safehttp (look for http.Get, http.DefaultClient, http.Client);
   - users.version is incremented in every write transaction, including the fetch's;
   - go.mod's go/toolchain lines are unchanged and no dependency beyond the allowed list was added.
5. Try to break it with cases the task file doesn't list: normalization edge cases (ports, uppercase scheme, empty query, repeated params, malformed queries), a title of exactly 300 characters, a URL of exactly 2,048, concurrent saves.
6. Integration tests can't be run by you. Say which ones exist and which criteria depend only on them.

Classify every finding as Blocking or Non-blocking. Blocking means it violates a requirement ID, an acceptance criterion or a convention, or it is a correctness bug you can reproduce; give the requirement ID, or the exact input and the wrong result. Anything else, including style, hypothetical races and refactoring ideas, is Non-blocking. Do not pad the report: if there are few real problems, say so.

Write the report to docs/tasks/save-a-url.report.md: criteria table first, then plan check, then rule checks, then findings with Blocking first (each with how to reproduce) and Non-blocking kept short. Commit and push your branch, and state its name at the top of the report.
```

---

## 3. Fix round (builder)

```
Read CLAUDE.md and docs/tasks/save-a-url.md. Check out <VERIFIER_BRANCH> and work on the branch this session gives you, which starts from it. Never push to main.

Read the verifier's report in docs/tasks/save-a-url.report.md. Fix only the findings marked Blocking, highest severity first, except any I name here as already fixed: <ALREADY_FIXED>. Write a failing test for each bug before you fix it. Don't fix Non-blocking findings; append them to docs/tasks/backlog.md instead. Don't add scope, don't refactor unrelated code, and don't change the task file or the report. If you disagree with a finding, don't fix it; say why in your report.

Run `make check`, commit in small steps, push your branch, and state its name at the top of your report. For each Blocking finding, say whether it is fixed (with the commit), disputed (with the reason) or not attempted (with the reason). Do not weaken or delete an existing test to make it pass; if a test seems wrong, say so instead.
```

---

## 4. Verifier, second pass

```
You are re-verifying the save-a-URL task. Read CLAUDE.md, AGENTS.md (Verifier role), docs/tasks/save-a-url.md and the previous report in docs/tasks/save-a-url.report.md. Check out <FIX_BRANCH> and work on the branch this session gives you, which starts from it. Never push to main.

You may add or fix tests and write a report. You may not change source code.

Check only two things: each Blocking finding from the previous report, and any regression the fixes could have caused. Run `make check`, and read the diff since the previous verification. Do not look for new issues beyond regressions.

For each earlier Blocking finding, report fixed, not fixed or disputed, with evidence (the test that now covers it, or the reproduction that now passes). Also report whether any existing test was weakened or deleted, and whether the fix round touched anything outside what the findings needed. Append your results to docs/tasks/save-a-url.report.md under a "Second pass" heading, commit and push your branch, and state its name at the top.
```
