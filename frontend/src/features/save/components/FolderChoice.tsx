import { useMemo } from 'react'
import { Select, type SelectOption } from '../../../components/ui/Select'
import { isUnauthorized } from '../../../lib/api/ApiError'
import type { Folder } from '../../../lib/api/folders'
import { buildFolderTree } from '../../../lib/folders/buildFolderTree'
import { moveTargets } from '../../../lib/folders/moveTargets'

/** The select's value for "Top level" (a folder id is never empty). */
export const TOP_LEVEL = ''

type Props = {
  /** `TOP_LEVEL` or a folder id. */
  value: string
  onValueChange: (value: string) => void
  onOpenChange: (open: boolean) => void
  /** The folder list as `useFolders()` gives it. */
  folders: { items: readonly Folder[] | undefined; pending: boolean; error: unknown; retry: () => void }
}

/**
 * The popup's folder choice, to sit under a label for `#save-folder`. While the folders load it is
 * disabled and reads "Loading…" (also for a 401: the login redirect is on its way; saving still works, to the top level). When they could not be
 * loaded it is disabled, reads "Top level" and says so, with a way to try again.
 */
export function FolderChoice({ value, onValueChange, onOpenChange, folders }: Props) {
  const { items, error } = folders
  const pending = folders.pending || (items === undefined && isUnauthorized(error))
  const options = useMemo<SelectOption[]>(() => {
    const rows = moveTargets(buildFolderTree(items ?? [])).map((row) => ({
      value: row.folder.id,
      label: row.folder.name,
      level: row.level,
    }))
    return [{ value: TOP_LEVEL, label: 'Top level' }, ...rows]
  }, [items])
  const failed = !pending && items === undefined

  return (
    <>
      <Select
        id="save-folder"
        options={options}
        value={value}
        onValueChange={onValueChange}
        onOpenChange={onOpenChange}
        disabled={items === undefined}
        valueText={pending ? 'Loading…' : failed ? 'Top level' : undefined}
      />
      {failed && (
        <p className="field__error">
          Couldn't load your folders. It will be saved to the top level.{' '}
          <button type="button" className="btn btn--sm" onClick={folders.retry}>
            Try again
          </button>
        </p>
      )}
    </>
  )
}
