import { ApiError } from '../api/ApiError'
import { LOGGED_OUT_TOAST } from '../bookmarks/describeFailure'

export const FOLDER_NAME_MAX = 100

export type FolderAction = 'create' | 'rename' | 'delete' | 'move'

export type FolderFailure = {
  /**
   * `signed-out`: the screen shows the signed-out message. `field`: the text sits under the
   * name field. `dialog`: the text sits in a banner inside the dialog.
   */
  kind: 'signed-out' | 'field' | 'dialog'
  message: string
  /** False for a 422 or a 409 (nothing changed on the server); true otherwise. */
  refresh: boolean
}

const GENERIC: Record<FolderAction, string> = {
  create: "Couldn't create the folder.",
  rename: "Couldn't rename the folder.",
  delete: "Couldn't delete the folder.",
  move: "Couldn't move the folder.",
}

export const NAME_REQUIRED = 'Give the folder a name.'
export const NAME_TOO_LONG = `Name is too long (${FOLDER_NAME_MAX} characters at most).`
export const NAME_CONFLICT = 'A folder with this name already exists here.'
export const DEPTH_EXCEEDED = 'Folders can only be nested 3 levels deep.'
export const FOLDER_GONE = 'This folder no longer exists.'
export const MOVE_FOLDER_GONE = 'That folder no longer exists.'
export const MOVE_NAME_CONFLICT = 'A folder with this name already exists there.'
export const MOVE_CYCLE = "A folder can't be moved into itself or one of its own subfolders."

/** A folder move: every message goes in the dialog's banner, none under a field. */
function moveFailure(status: number, code: string | undefined): FolderFailure | null {
  if (status === 404) return { kind: 'dialog', message: MOVE_FOLDER_GONE, refresh: true }
  if (status === 409 && code === 'folder_name_conflict') {
    return { kind: 'dialog', message: MOVE_NAME_CONFLICT, refresh: false }
  }
  if (status === 422) {
    // Nothing changed on the server, so no refresh, whatever the code.
    if (code === 'folder_depth_exceeded') return { kind: 'dialog', message: DEPTH_EXCEEDED, refresh: false }
    if (code === 'folder_cycle') return { kind: 'dialog', message: MOVE_CYCLE, refresh: false }
    return { kind: 'dialog', message: GENERIC.move, refresh: false }
  }
  return null
}

function rateLimitMessage(retryAfter: number | null): string {
  if (retryAfter !== null && Number.isInteger(retryAfter) && retryAfter >= 0) {
    return `Too many requests. Try again in about ${retryAfter} seconds.`
  }
  return 'Too many requests. Try again in a moment.'
}

/** Maps whatever a folder call threw to what the dialog shows and whether to refresh. Pure. */
export function folderFailureMessage(action: FolderAction, error: unknown): FolderFailure {
  const generic: FolderFailure = { kind: 'dialog', message: GENERIC[action], refresh: true }
  if (!(error instanceof ApiError)) return generic

  const { status } = error
  const code = error.problem?.code

  if (status === 401) return { kind: 'signed-out', message: LOGGED_OUT_TOAST, refresh: true }
  if (status === 429) return { kind: 'dialog', message: rateLimitMessage(error.retryAfter), refresh: true }
  if (action === 'move') return moveFailure(status, code) ?? generic
  if (status === 404) return { kind: 'dialog', message: FOLDER_GONE, refresh: true }
  if (status === 409 && code === 'folder_name_conflict' && action !== 'delete') {
    return { kind: 'field', message: NAME_CONFLICT, refresh: false }
  }
  if (status === 422 && action !== 'delete') {
    if (code === 'folder_depth_exceeded') return { kind: 'dialog', message: DEPTH_EXCEEDED, refresh: false }
    const nameErrors = (error.problem?.errors ?? []).filter((e) => e.field === 'name')
    if (nameErrors.some((e) => e.code === 'required')) return { kind: 'field', message: NAME_REQUIRED, refresh: false }
    if (nameErrors.some((e) => e.code === 'too_long')) return { kind: 'field', message: NAME_TOO_LONG, refresh: false }
  }
  return generic
}
