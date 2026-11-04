const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What the delete confirmation says will happen, from the counts the loaded list gives. */
export function deleteFolderText(name: string, subfolders: number, bookmarks: number): string {
  const question = `Delete “${name}”?`
  if (subfolders === 0 && bookmarks === 0) return `${question} This folder is empty.`
  const sentences: string[] = []
  if (subfolders > 0) sentences.push(`Its ${plural(subfolders, 'subfolder', 'subfolders')} will be deleted too.`)
  if (bookmarks > 0) sentences.push(`${plural(bookmarks, 'bookmark', 'bookmarks')} in it will be moved to the trash.`)
  return `${question} ${sentences.join(' ')}`
}
