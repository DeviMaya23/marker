import { useQuery } from '@tanstack/react-query'
import { listFolders } from '../api/folders'
import { FOLDERS_KEY } from './queryKeys'

/** The user's folders as a flat list in the server's order (`data`), with the query's status. */
export function useFolders() {
  return useQuery({
    queryKey: FOLDERS_KEY,
    queryFn: listFolders,
    select: (response) => response.items,
    retry: false,
  })
}
