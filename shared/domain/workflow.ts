export type Role = 'owner' | 'manager' | 'member' | 'retoucher' | 'guest_admin' | 'customer' | 'participant' | 'finalizer'
export type Action =
  | 'album.create'
  | 'album.view'
  | 'album.settings'
  | 'album.publish'
  | 'selection.select'
  | 'selection.finalize'
  | 'note.write'

const permissions: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(['album.create', 'album.view', 'album.settings', 'album.publish', 'selection.select', 'selection.finalize', 'note.write']),
  manager: new Set(['album.create', 'album.view', 'album.settings', 'album.publish', 'selection.select', 'selection.finalize', 'note.write']),
  member: new Set(['album.create', 'album.view', 'album.publish']),
  retoucher: new Set(['album.view']),
  guest_admin: new Set(['album.view', 'album.settings', 'album.publish', 'selection.finalize']),
  customer: new Set(['album.view', 'selection.select', 'note.write']),
  participant: new Set(['album.view', 'selection.select', 'note.write']),
  finalizer: new Set(['album.view', 'selection.select', 'selection.finalize', 'note.write']),
}

export function canPerform(role: Role, action: Action): boolean {
  return permissions[role].has(action)
}
