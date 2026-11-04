import { Search, X } from 'lucide-react'
import { SegmentedControl, type SegmentedOption } from '../../../components/ui/SegmentedControl'
import { Switch } from '../../../components/ui/Switch'
import { useListSearch, type SearchScope } from '../hooks/useListSearch'
import { MAX_TERM_LENGTH } from '../lib/listSearch'

type Props = {
  /** The folder of a folder page: its id, and its name once the folders have loaded. */
  folder?: { id: string; name?: string }
}

/** The search field, scope control and notes switch above a list. The search lives in the URL. */
export function SearchBar({ folder }: Props) {
  const { inputProps, text, applied, scope, clear, setIncludeNotes, chooseScope } = useListSearch({
    folderId: folder?.id,
  })

  const options: SegmentedOption[] = [
    { value: 'all', label: 'All bookmarks' },
    {
      value: 'folder',
      label: folder?.name ? `“${folder.name}” & subfolders` : 'This folder & subfolders',
      disabled: !folder,
      title: folder ? undefined : 'Open a folder to search inside it',
    },
  ]

  return (
    <div className="search-bar" role="search">
      <div className="search-field">
        <Search size={15} className="search-field__icon" aria-hidden="true" />
        <input
          type="search"
          aria-label="Search bookmarks"
          placeholder="Search title, URL and page content…"
          maxLength={MAX_TERM_LENGTH}
          autoComplete="off"
          {...inputProps}
        />
        {text !== '' && (
          <button type="button" className="search-field__clear" aria-label="Clear search" onClick={clear}>
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <SegmentedControl
        label="Search scope"
        options={options}
        value={scope}
        onValueChange={(value) => chooseScope(value as SearchScope)}
      />
      <Switch
        label="Include notes"
        checked={applied.includeNotes}
        onCheckedChange={setIncludeNotes}
        disabled={applied.q === ''}
      />
    </div>
  )
}
