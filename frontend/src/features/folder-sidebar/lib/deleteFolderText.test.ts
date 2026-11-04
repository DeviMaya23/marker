import { describe, expect, it } from 'vitest'
import { deleteFolderText } from './deleteFolderText'

describe('deleteFolderText', () => {
  it.each([
    ['empty', 0, 0, 'Delete “Recipes”? This folder is empty.'],
    ['one subfolder only', 1, 0, 'Delete “Recipes”? Its 1 subfolder will be deleted too.'],
    ['subfolders only', 3, 0, 'Delete “Recipes”? Its 3 subfolders will be deleted too.'],
    ['bookmarks only', 0, 4, 'Delete “Recipes”? 4 bookmarks in it will be moved to the trash.'],
    ['one bookmark only', 0, 1, 'Delete “Recipes”? 1 bookmark in it will be moved to the trash.'],
    [
      'both',
      2,
      5,
      'Delete “Recipes”? Its 2 subfolders will be deleted too. 5 bookmarks in it will be moved to the trash.',
    ],
    [
      'both, singular',
      1,
      1,
      'Delete “Recipes”? Its 1 subfolder will be deleted too. 1 bookmark in it will be moved to the trash.',
    ],
  ])('%s', (_name, subfolders, bookmarks, text) => {
    expect(deleteFolderText('Recipes', subfolders, bookmarks)).toBe(text)
  })
})
