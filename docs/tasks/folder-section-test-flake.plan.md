# Plan: folder-section-test-flake

All items are in `frontend/src/features/folder-sidebar/components/FolderSection.test.tsx`.

- [x] AC1: the `it.each` "when viewing %s, deleting %s %s leaves you at %s" block ends with `await waitFor(() => expect(where()).toBe(expected))` after the dialog-closed wait; no bare `expect(where())` follows it. Comment above updated. Test: that `it.each` block.
- [x] AC2: all six rows keep their names and expected paths and share the one assertion; no sleep, timer or timeout change. Test: same `it.each` block.
- [x] AC3: no other test changes unless it asserts a location that changes without waiting. Checked: create (`/` unchanged), failed delete (`/folder/a` unchanged), move (`/folder/b` unchanged), history-replace (already `waitFor`). Test: those four, expected to stay untouched.
- [x] AC4: file passes 20 runs alone and 10 runs alongside the full suite (`npx vitest run src/features/folder-sidebar/components/FolderSection.test.tsx`).
- [x] AC5: `make check` passes; only the test file and this plan changed.

## Results

- Alone: 20/20 passes. Alongside a full `npx vitest run` started in the background: 10/10 passes. The background suite may have finished before all 10 loaded runs did, so the load was not guaranteed for every run.
- `make check`: passed (exit 0). Redocly printed 7 existing tag-description warnings in `openapi.yaml`, which I left alone.
- I did not reproduce the flake on `main`, so the fix is not proven. The assertion no longer depends on timing.

## Judgment calls

- The task says to keep the dialog-closed wait and add the location wait after it. I kept the two as separate `waitFor` calls instead of merging them.
- I reworded the comment to say the toast and the dialog closing can render before the new location does.
- Item 4: none of the other tests needed a change, so none changed.
- I ran `npm ci` in `frontend/` because the checkout had no `node_modules`. It changed no tracked file.
- I did not run `make test-integration-local`: the task touches only a frontend test.
