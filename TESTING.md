# Testing

> Agent-agnostic. Applies to all implementation agents.

---

## Backend

### Philosophy

Test usecase behaviour, not structure. A test that only verifies a method was called, or that an error passed through unchanged, tests implementation — not correctness. Integration tests cover real outcomes; unit tests cover logic that lives exclusively in the usecase.

### Layer coverage

| Layer | Test type |
|---|---|
| `usecase/` | Unit tests |
| `handler/` | Unit tests |
| `repository/` | Integration tests only — no unit tests |
| `adaptor/` | Unit tests for logic the adaptor holds (see External services); no database |
| `pkg/safehttp` | Unit tests (security-critical, see below) |

### Test files

One test file per source file: `fetch.go` is tested in `fetch_test.go`, and its integration tests, if it has any, in `fetch_integration_test.go`. Edge cases and regressions are rows in a table or subtests in that file, named for the behavior they pin. Never create a separate `_edge`, `_regress` or `_bugfix` file. A test written for a bug goes into the existing test file for the code that was fixed.

When a source file grows too big to read, split the source file by concern and move its tests with it, keeping the names in step (`bookmark_search.go` with `bookmark_search_test.go`). Do not split only the tests.

### Test imports

Tests keep the same dependency direction as the code. A change in one layer must not break another layer's tests.

- `repository/` integration tests import `domain`, `repository` and `testutil`. They never import `usecase` or `handler`, and never construct a service.
- `usecase/` tests use the fakes in `fakes_test.go` for stores and queues. They never import `repository`.
- `handler/` tests use per-handler usecase doubles. They never import `repository`.

A behavior that spans layers is split at the seam. The persistence side is tested in `repository/` against the database (a concurrent save, the cap, what a lookup returns). The rule side is tested in the usecase with fakes (how a duplicate is reported, what happens when the queue fails). Do not write a test that wires real layers together to check both at once.

### Running integration tests

Repository integration tests need Docker, so they carry the build tag and are excluded from `go test ./...`:

```go
//go:build integration
```

Run them with `make test-integration`. `make lint` still compiles them (`go vet -tags integration`), so a broken integration test is caught without Docker. The shared helper is `testutil.NewDB(t)`: one container per test process, so tests create their own users and never assume empty tables. `repository/schema_integration_test.go` is the pattern to copy. Agents write these tests but usually cannot run them: in a report, say "integration tests written, not run" rather than claiming they pass.

### What to test in usecases

**Happy path** — only if the usecase adds assembly or transformation. If the function delegates to a repo and returns the result unchanged, the happy path is covered by integration tests.

Worth testing:
- Assembling a composite result from multiple sources
- Computing a derived value (the normalized URL, a cursor)
- Conditional output based on branching logic
- Rules that decide an outcome: URL normalization (FR-22), folder depth, cycle and sibling-name checks (FR-13, FR-26), duplicate-before-cap ordering (NFR-17), and what a finished fetch may update (FR-5b, FR-5c)

**Exception:** external services not backed by integration tests (e.g. the Kinde client). Happy paths that assemble results from these are worth unit testing even without transformation, because there is no integration fallback.

**Error path** — only if the usecase adds behaviour to the error:
- Wrapping: `fmt.Errorf("context: %w", err)`
- Mapping to a domain sentinel: `ErrDuplicateBookmark`, `ErrFolderDepthExceeded`, `ErrFolderNameConflict`
- Side effects or conditional logic triggered on the error path

Do not write error path tests for pure pass-through (`if err != nil { return nil, err }` with no other logic).

### What not to test

- Pure delegation — function calls one dependency and returns the result unchanged
- Error pass-through — `return nil, err` with no wrapping, mapping, or side effects
- Logging side effects — not verifiable in unit tests

### Test doubles

**Use a fake** when the test requires setting up pre-state in a dependency AND asserting post-state. The signal is: the function reads existing state to decide what to write.

```go
// SaveBookmark reads whether the normalized URL already exists → branches → writes the bookmark
// Fake starts with: the URL is already saved (live, or in the trash) or it isn't
// Fake ends with:   a new bookmark exists, or the save was rejected as a duplicate
// Assert the outcome, not the call graph
```

**Use a value-return spy** for everything else — single-step operations, external services, and cases where what got called IS the verifiable behaviour (e.g. confirming a no-op skipped a write).

Test doubles implement only the narrow interface defined by the consuming usecase — not the full repository interface. If the usecase defines `type bookmarkCounter interface { CountByUserID(...) }`, the test double implements only that one method.

### Table-driven tests

Use TDT when all of the following are true:
- 3 or more scenarios
- All cases share identical setup structure
- Cases differ only in inputs, outputs, or expected errors

Use individual `t.Run` blocks when cases need different setup, or when there are fewer than 3 scenarios. Do not stretch TDT to fit cases with varying mock configurations.

### Assertion quality

- Assert the result, not just the error
- Failure scenarios must assert the specific error type or message — not just that an error occurred
- Use `require.ErrorIs` for sentinel errors, `require.ErrorContains` for message matching

### Repository integration tests

Repository tests run against a real database via testcontainers. They verify the **database contract** — what each method promises about its interaction with the schema.

**Always test:**

- **Query correctness** — the right records are returned with the right fields, including preloaded associations where applicable
- **Ownership / user isolation** — a record belonging to user A is not accessible to user B. This is a security property (NFR-7) and the most commonly missing test. Methods that scope by `userID` must have a wrong-user case asserting `gorm.ErrRecordNotFound`
- **Soft delete semantics** — trashed bookmarks are excluded from standard list and search queries and visible only in the explicit trash query
- **Constraint behaviour** — unique constraints return the expected error, including that a trashed bookmark still blocks a duplicate `normalized_url` (FR-23) and that sibling folder names collide case-insensitively, at root as well; FK violations are caught
- **Cascade behaviour** — folder delete trashes every bookmark in the subtree and removes the folders in one transaction (FR-16), and account delete removes everything the user owns (FR-25). Verify that related rows are actually affected

**Do not test:**

- Infrastructure failures by closing the DB connection — this tests the driver, not the contract. Drop any test that forces an error by calling `sqlDB.Close()`

**Assertion style** — use `require` / `assert` from testify throughout. Do not use bare `if err != nil { t.Fatalf }` checks.

### Test double placement

| Double | Location | Reason |
|---|---|---|
| Fakes (repository interfaces) | `usecase/fakes_test.go` | shared across test files in the package; real logic should not be duplicated |
| Spies (external services) | inline in `*_test.go` | small, vary per scenario, no sharing benefit |
| Spies (handler usecase mocks) | inline in `handler/*_test.go` | per-handler interfaces, nothing to share across files |

### External services

External services (the Kinde client, the page-fetch adaptor) are thin adapters over third-party systems. They delegate to an SDK or HTTP client with no domain logic.

- No unit tests on the implementation — correctness depends on the external system, not on code in this repo
- When used as a dependency in usecase tests, always use a value-return spy
- Integration tests only if the adapter contains non-trivial logic worth verifying against the real system

An adaptor that holds logic of its own, such as the page fetcher's text extraction and favicon discovery, is the exception to the first rule. Test the real adaptor against an `httptest` server, with `safehttp.NewForTesting`, and assert on what it returns. Do not involve a database: the next layer's side of the seam is tested there, with fakes in the usecase and the real schema in the repository.

### Security-critical logic: `pkg/safehttp`

`pkg/safehttp` is not a thin adapter. It enforces NFR-8 and NFR-9 and is tested directly, because a hole in it is a server-side request forgery hole.

Test, at minimum:
- Address classification, table-driven: loopback, private IPv4 ranges, link-local (including the cloud metadata address), unspecified, the IPv6 equivalents, and IPv4-mapped IPv6
- A hostname that resolves to a blocked address is refused — the check applies to the address actually connected to, not only the name
- Every redirect hop is checked, and the hop limit holds
- Response size cap, content-type allowlist and timeout are enforced

Tests that need a local server (`httptest`) bind to loopback, which `safehttp` blocks. It therefore has an explicit option to allow loopback that only test code sets. The production constructor cannot enable it.

### Handler tests

The handler's job is: parse request → extract auth → call usecase → map errors → serialize response. Tests verify that plumbing is correct.

**Always test:**
- Happy path — assert both the HTTP status code and the response body shape. The handler assembles the HTTP response; that assembly is handler logic even when the usecase result passes through unchanged.
- Each distinct error mapping to a `code` in `openapi.yaml` — `ErrDuplicateBookmark → 409 duplicate_bookmark`, `gorm.ErrRecordNotFound → 404 not_found`, generic error → 500. Each unique mapping is a test case. Assert the `application/problem+json` shape, not just the status.
- Binding failures — malformed JSON body, invalid UUID path param.

**Request parsing** — handler tests may assert what was passed down to the usecase spy (e.g. `lastUpdateParams`) when the interesting logic is in how the handler parses or extracts the request. This is behavioral for the handler layer.

**Test doubles** — always value-return spies for usecase dependencies. Fakes are not used at the handler layer.

**No equivalent of "pure delegation, drop the test"** — even a handler that returns 204 with no body has error mapping worth testing.

**Contract conformity** — responses must match the shapes in `openapi.yaml`. How that check is automated (for example validating responses against the spec inside tests) is decided at the foundation step.

---

## Frontend

### Philosophy

Same criterion as the backend: test logic that lives in your code. Do not test pass-through, third-party library behaviour, markup or styling.

### What to test

| Shape | Example | Unit test? |
|---|---|---|
| Pure logic (no I/O) | cursor handling, error-code-to-message mapping, URL helpers | Yes |
| Hook with state, effects or orchestration | the sync-version poll, a search hook, trash restore/empty lifecycle | Yes |
| Component with branching UI logic | the save popup (saved closes itself, duplicate and error stay open, Enter confirms, Esc cancels) | Yes |
| Presentational component (props in, markup out) | a bookmark row, an empty state | No |
| Thin API wrapper over generated types | one call per endpoint | No |

### Test setup

- Test runner is Vitest with Testing Library (jsdom). Test files are colocated next to the unit they cover (`useThing.ts` + `useThing.test.ts`).
- API calls are mocked at the API-wrapper boundary with value-return spies (`vi.fn().mockResolvedValue(...)`). Fakes are not used.
- Use fake timers for time-driven behaviour: the 2 to 3 second sync poll and the save popup's auto-close.
- A hook that attaches effects to a DOM ref is tested through a small harness component, not bare `renderHook` (see `CONVENTIONS.md`).
