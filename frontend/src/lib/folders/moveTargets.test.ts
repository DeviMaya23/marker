import { describe, expect, it } from 'vitest'
import type { Folder } from '../api/folders'
import { folder } from '../../test/builders'
import { buildFolderTree } from './buildFolderTree'
import { moveTargets } from './moveTargets'

const f = (id: string, parent: string | null, depth: number): Folder =>
  folder({ id, parent_id: parent, depth, name: id })

// a(1) > b(2) > c(3);  d(1) > e(2);  g(1)
const THREE_LEVELS = [f('a', null, 1), f('b', 'a', 2), f('c', 'b', 3), f('d', null, 1), f('e', 'd', 2), f('g', null, 1)]

/** Rows as `id` with a `-` suffix when disabled, indented by dots per level. */
function show(items: Folder[], moving?: string): string[] {
  const tree = buildFolderTree(items)
  const rows = moveTargets(tree, moving ? items.find((i) => i.id === moving) : undefined)
  return rows.map((r) => `${'.'.repeat(r.level)}${r.folder.id}${r.disabled ? '-' : ''}`)
}

describe('moveTargets', () => {
  it.each<[string, Folder[], string | undefined, string[]]>([
    ['a bookmark, empty tree', [], undefined, []],
    ['a bookmark, flat tree: nothing disabled', [f('a', null, 1), f('b', null, 1)], undefined, ['a', 'b']],
    ['a bookmark, 3-level tree: nothing disabled', THREE_LEVELS, undefined, ['a', '.b', '..c', 'd', '.e', 'g']],
    [
      'a folder without children (a one-level subtree): fine under depth 1 and 2, not under depth 3',
      THREE_LEVELS,
      'g',
      ['a', '.b', '..c-', 'd', '.e', 'g-'],
    ],
    [
      'a folder with one level of children (a two-level subtree): fine under depth 1, not under depth 2 or 3',
      THREE_LEVELS,
      'd',
      ['a', '.b-', '..c-', 'd-', '.e-', 'g'],
    ],
    [
      'a folder with two levels of children (a three-level subtree): fits under no folder, only the top level',
      [f('a', null, 1), f('b', 'a', 2), f('c', 'b', 3), f('x', null, 1), f('y', 'x', 2), f('z', 'y', 3), f('g', null, 1)],
      'x',
      // x has height 3: even a depth-1 row would put the deepest folder at level 4.
      ['a-', '.b-', '..c-', 'x-', '.y-', '..z-', 'g-'],
    ],
  ])('%s', (_name, items, moving, expected) => {
    expect(show(items, moving)).toEqual(expected)
  })

  it('a two-level subtree can go under depth 1 and not under depth 2', () => {
    const items = [f('a', null, 1), f('b', 'a', 2), f('m', null, 1), f('n', 'm', 2)]
    // moving m (height 2): under a (1 + 2 = 3) fine; under b (2 + 2 = 4) disabled.
    expect(show(items, 'm')).toEqual(['a', '.b-', 'm-', '.n-'])
  })

  it('disables the folder itself and its grandchild', () => {
    const items = [f('a', null, 1), f('b', 'a', 2), f('c', 'b', 3), f('t', null, 1)]
    expect(show(items, 'a')).toEqual(['a-', '.b-', '..c-', 't-'])
  })

  it('keeps the current parent valid', () => {
    const items = [f('p', null, 1), f('k', 'p', 2)]
    expect(show(items, 'k')).toEqual(['p', '.k-'])
  })

  it('shows an orphan at the top level and still applies the depth rule from its own depth', () => {
    const items = [f('a', null, 1), f('o', 'missing', 2), f('m', null, 1), f('n', 'm', 2)]
    // m has height 2: under orphan o (depth 2 + 2 = 4) is disabled.
    expect(show(items, 'm')).toEqual(['a', 'o-', 'm-', '.n-'])
  })

  it('keeps the server order, not alphabetical', () => {
    const items = [f('z', null, 1), f('m', 'z', 2), f('b', 'z', 2), f('a', null, 1)]
    expect(show(items)).toEqual(['z', '.m', '.b', 'a'])
  })

  it('moving a whole depth-3 chain disables every row, including a depth-1 sibling, at the exact limit', () => {
    // x(1) > y(2) > z(3) has height 3; a depth-1 target gives 1 + 3 = 4 > 3.
    const items = [f('x', null, 1), f('y', 'x', 2), f('z', 'y', 3), f('t', null, 1)]
    expect(show(items, 'x')).toEqual(['x-', '.y-', '..z-', 't-'])
    // a depth-2 chain (height 2) fits under depth 1 (1 + 2 = 3, the exact limit).
    const two = [f('x', null, 1), f('y', 'x', 2), f('t', null, 1)]
    expect(show(two, 'x')).toEqual(['x-', '.y-', 't'])
  })

  it('does not crash when the moved folder is not in the list', () => {
    const tree = buildFolderTree([f('a', null, 1)])
    const rows = moveTargets(tree, f('gone', null, 1))
    expect(rows.map((r) => r.disabled)).toEqual([false])
  })
})
