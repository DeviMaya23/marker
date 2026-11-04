# Plan: folder-section-test-flake

All items are in `frontend/src/features/folder-sidebar/components/FolderSection.test.tsx`.

- [ ] AC1: the `it.each` "when viewing %s, deleting %s %s leaves you at %s" block ends with `await waitFor(() => expect(where()).toBe(expected))` after the dialog-closed wait; no bare `expect(where())` follows it. Comment above updated. Test: that `it.each` block.
- [ ] AC2: all six rows keep their names and expected paths and share the one assertion; no sleep, timer or timeout change. Test: same `it.each` block.
- [ ] AC3: no other test changes unless it asserts a location that changes without waiting. Checked: create (`/` unchanged), failed delete (`/folder/a` unchanged), move (`/folder/b` unchanged), history-replace (already `waitFor`). Test: those four, expected to stay untouched.
- [ ] AC4: file passes 20 runs alone and 10 runs alongside the full suite (`npx vitest run src/features/folder-sidebar/components/FolderSection.test.tsx`).
- [ ] AC5: `make check` passes; only the test file and this plan changed.
