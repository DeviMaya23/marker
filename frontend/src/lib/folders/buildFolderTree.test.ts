import { describe, expect, it } from 'vitest'
import type { Folder } from '../api/folders'
import { buildFolderTree, type FolderNode } from './buildFolderTree'

function folder(id: string, parent_id: string | null, bookmark_count = 0): Folder {
  return {
    id,
    name: `Folder ${id}`,
    parent_id,
    depth: 1,
    bookmark_count,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

/** The tree as nested `id(count)[children]` text, to compare shape, order and counts at once. */
function show(nodes: FolderNode[]): string {
  return nodes.map((n) => `${n.folder.id}(${n.subtreeCount})${n.children.length ? `[${show(n.children)}]` : ''}`).join(' ')
}

describe('buildFolderTree', () => {
  it.each([
    ['empty', [], ''],
    ['flat', [folder('b', null, 1), folder('a', null, 2)], 'b(1) a(2)'],
    ['three levels', [folder('a', null, 1), folder('b', 'a', 2), folder('c', 'b', 3)], 'a(6)[b(5)[c(3)]]'],
    ['an orphan goes to the top level', [folder('a', null, 1), folder('o', 'missing', 4)], 'a(1) o(4)'],
    [
      'siblings keep the server order, not alphabetical',
      [folder('z', null), folder('m', 'z'), folder('b', 'z'), folder('a', null)],
      'z(0)[m(0) b(0)] a(0)',
    ],
    [
      'counts add up over a whole subtree and not across siblings',
      [folder('a', null, 1), folder('b', 'a', 2), folder('c', 'a', 4), folder('d', 'c', 8), folder('e', null, 16)],
      'a(15)[b(2) c(12)[d(8)]] e(16)',
    ],
    ['a child listed before its parent', [folder('b', 'a', 2), folder('a', null, 1)], 'a(3)[b(2)]'],
    ['a folder that is its own parent does not crash', [folder('a', 'a', 1)], 'a(1)'],
  ])('%s', (_name, items, expected) => {
    expect(show(buildFolderTree(items).roots)).toBe(expected)
  })

  it('looks a folder up by id', () => {
    const tree = buildFolderTree([folder('a', null, 1), folder('b', 'a', 2)])
    expect(tree.get('b')?.subtreeCount).toBe(2)
    expect(tree.get('nope')).toBeUndefined()
  })

  it('gives the descendants of a folder without the folder itself', () => {
    const tree = buildFolderTree([folder('a', null), folder('b', 'a'), folder('c', 'b'), folder('d', null)])
    expect(tree.descendantIds('a')).toEqual(new Set(['b', 'c']))
    expect(tree.descendantIds('c')).toEqual(new Set())
    expect(tree.descendantIds('unknown')).toEqual(new Set())
  })

  it('terminates on a parent loop in bad data', () => {
    const tree = buildFolderTree([folder('a', 'b', 1), folder('b', 'a', 1), folder('r', null)])
    expect(show(tree.roots)).toBe('r(0)')
    expect(tree.descendantIds('a')).toEqual(new Set(['b', 'a']))
  })
})
