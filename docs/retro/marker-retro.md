# Retro: marker, the whole process

Summary of the retro of the first multi-agent build (marker, 2026-11-01 to 2026-11-08: about a week from first commit to production, 357 commits, 36 tasks). Raw notes with evidence and numbers are in `retro-notes.md` (IDs such as D5, P9, T3, C5 refer to it). Goal: reuse the process for a second web app, with the stack not yet decided. Everything is tagged **process** (carries over) or **stack** (rewritten per app).

## What worked (keep)

- Order: requirements, then `openapi.yaml`, then a design brief from both, then a design. The design came out spec-compliant. The brief is good as is.
- The draft, build, verify, fix flow. About 33 of 36 tasks cleared at the first verifier. The verifier's method (a "Real?" column, mutation checks) caught real problems, such as tests edited to go green over a real bug.
- Contract as a limit: agents may not change `openapi.yaml` or the requirements; changes are discussed first. Small tasks with explicit ownership, so parallel agents did not collide.
- A fast build: the features took about two days of cloud sessions.

## The ten changes that matter most

1. Decide the whole stack up front, including the front-end component library, and answer every concern explicitly, "none" included (D1, D2). Give the stack to the design step.
2. Lint or validate every file type in `make check` from the first commit, and set up CI at scaffold (D5, C1).
3. Decide deployment at scaffold: a production map (what runs where, how it is wired, which config keys, where each value comes from) and an env contract in `.env.example` (C2, C5). Bake proven deployment pieces into the starter code.
4. Reconcile the design's error and state table with the contract's statuses before drafting tasks (P10).
5. Verifier findings need a trigger ("matters when") and a bin (fix now, track, report only); a cap and a scheduled hardening slice stop the backlog piling up; "Decide" items get a deadline (P9).
6. Add a docs-sync section to the verifier report so the specs and `STACK.md` do not drift (P4).
7. Never weaken a test to make it pass (builder prompt) (P8).
8. Test in tiers: light per task matched to risk; bigger tests (a small end-to-end suite, contract conformance, a manual smoke) at milestones; every bug found by hand leaves a trap behind (T1, T2, T8 to T10).
9. Make the manual checklist derived and tracked, not invented and scattered (T3).
10. Be agent-agnostic: `AGENTS.md` as the entry file, `CLAUDE.md` a link, the roles file renamed, the launcher split from the prompts (P1, P2).

## Lessons by section

**Requirements, spec and design.** Do not leave the component library undecided (the design came out hand-rolled and agents copied it). The "reference only, copy CSS only" rule belongs in the task template from day one. The verifier checks for hand-rolled versions of what the library provides. A missing CSS brace was found only by eye; nothing else would catch it. Keep the design brief as is (D1 to D7).

**Scaffold and agent files.** Name library choices in `STACK.md`, but let the drafter resolve versions at drafting time (latest stable, a freshness rule), recorded in the task and approved with it (P5). Seed the backlog at scaffold from the contract and requirements as a coverage map; keep the file for curated items only (P13). Start triage when the backlog starts, and use a script for the triage commit (P14). Squash-merge task PRs; docs pushes get a prefix; branches are `feat/<slug>` and `verify/<slug>` (P11, P12).

**Implementation with agents.** Drafting felt long: scope the second checker round to the changed lines and give the drafter the checker's recurring catches as a checklist (P6). Acceptance-criteria detail stays high for backend, contract and security tasks and can drop for pure UI (P7). Record checker findings per round to get data.

**Testing.** The missing layer was contract conformance (nothing validated responses or mocks against `openapi.yaml`). Add a small end-to-end smoke (5 to 8 golden journeys) and test the join between the two halves at slice level. Generate endpoint requests from the contract instead of hand-building a collection. Add a test profile to the requirements at kickoff (top failure modes, high-risk paths, milestone definition). Add a real-URL corpus for any fetcher (T1 to T10).

**Deployment.** "Later" turned out to be during the deploy: about seven deployment-driven changes came after the features. Write the runbook while deploying (ask the helping agent to record every command that finally worked). Pre-flight checklist from this deploy's errors; a go-live prerequisites list with start dates (some third-party steps take days); a post-deploy smoke test. Copy the parts that are not what you are learning, write them down, change at most one thing per project on purpose (C1 to C6).

## Starter kit for app 2

Classification is from file names and what I know of their contents; check each file when building the kit.

**Reuse as is (process)**
- `docs/design/ui-reference/ui-design-brief.md` as a template (replace the product description).
- The verifier method in `docs/tasks/prompts/verify-1.txt` and `verify-2.txt` (the "Real?" and mutation approach).

**Generalize (process, with marker or Claude specifics inside)**
- `docs/tasks/AUTHORING.md`, `TEMPLATE.md`, `prompts.md` and all of `docs/tasks/prompts/*.txt`: remove marker names and Go-specific commands; add the additions from this retro (reference-not-code rule, never weaken a test, docs-sync section, trigger-tagged findings, checker checklist, scoped round 2, decision deadline).
- `scripts/stage.sh`, `scripts/status.sh`: split "what a stage is" from "how it is launched"; look up branches by task slug; add the triage-commit script and an open-manual-checks count.
- `AGENTS.md` (roles and ownership): rename (for example `ROLES.md`); put the entry content of `CLAUDE.md` into a new `AGENTS.md`, with `CLAUDE.md` a link.
- `docs/tasks/backlog.md` structure: curated sections only, with triggers and bins; the rest derived.
- The process half of `CONVENTIONS.md` (decision boundaries) and `TESTING.md` (agents write integration tests and report "written, not run").

**Rewrite per stack (stack layer)**
- `STACK.md` (start from the concerns checklist), `ARCHITECTURE.md`, the technical halves of `CONVENTIONS.md` and `TESTING.md`.

**New files this retro adds**
- A production map and env contract; a go-live prerequisites list; a test profile; a requirements-to-tests coverage matrix; a deploy pre-flight checklist and a runbook; a CI workflow at scaffold; a design-versus-contract reconciliation step.

**Code that can be baked into the starter if the stack stays the same** (otherwise treat as a checklist): the backend Dockerfile, the env-file loader, the proxy shared-secret check, the health endpoint, `deploy/worker.mjs` and its test, the migrate, CI and build-and-push workflows, the `Makefile` targets, the dev-login bypass, and, where the app has them, the SSRF-safe HTTP client and the fake identity provider for tests.

## Proposed order for app 2

1. Kickoff: requirements, a test profile, a go-live prerequisites list (start the slow items).
2. Contract; reconcile the design brief's error table against it.
3. Stack decisions (checklist), the production map and env contract.
4. Design (given the stack).
5. Scaffold: repo, `AGENTS.md` and `CLAUDE.md` link, roles file, `make check` covering every file type, CI, backlog seeded from the coverage map, deployment pieces, a browser checkpoint after the first front-end slice.
6. Build loop: draft (scoped second check) then build, verify, fix; squash-merge; `feat/` and `verify/` branches.
7. Milestones: hardening slice, contract conformance, end-to-end smoke, manual smoke, derived checklist.
8. Deploy: pre-flight checklist, runbook written as you go, post-deploy smoke.

## Deferred and open

- OpenSpec versus the hand-rolled flow: to be discussed at length, separately. Current stance: borrow ideas, keep the verifier and fix loop.
- Requirements gathering: not remembered; optionally review that chat later to extract the question list.
- The bookmarklet bug (a fetch fails when saved through the bookmarklet): handled separately, not part of this retro.
- Whether a cloud session may push a branch with a name other than the one it was given: test in app 2's first task.
- The remembered "Decide" item about design and status codes (not recovered).
- Which tests matter most depends on the app; decided by its test profile at kickoff.
