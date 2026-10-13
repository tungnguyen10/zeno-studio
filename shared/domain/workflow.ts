export type ProductionStatus =
  | 'PENDING'
  | 'RETOUCHING'
  | 'WAITING_REVIEW'
  | 'APPROVED'
  | 'REVISION_REQUESTED'
  | 'DELIVERED'

const productionTransitions: Record<ProductionStatus, readonly ProductionStatus[]> = {
  PENDING: ['RETOUCHING'],
  RETOUCHING: ['WAITING_REVIEW'],
  WAITING_REVIEW: ['APPROVED', 'REVISION_REQUESTED'],
  APPROVED: ['DELIVERED'],
  REVISION_REQUESTED: ['RETOUCHING'],
  DELIVERED: [],
}

export function canTransitionProduction(from: ProductionStatus, to: ProductionStatus): boolean {
  return productionTransitions[from].includes(to)
}

export type Role = 'owner' | 'manager' | 'member' | 'retoucher' | 'guest_admin' | 'customer' | 'participant' | 'finalizer'
export type Action =
  | 'album.create'
  | 'album.view'
  | 'album.settings'
  | 'album.publish'
  | 'selection.select'
  | 'selection.finalize'
  | 'note.write'
  | 'production.update'
  | 'delivery.manage'

const permissions: Record<Role, ReadonlySet<Action>> = {
  owner: new Set(['album.create', 'album.view', 'album.settings', 'album.publish', 'selection.select', 'selection.finalize', 'note.write', 'production.update', 'delivery.manage']),
  manager: new Set(['album.create', 'album.view', 'album.settings', 'album.publish', 'selection.select', 'selection.finalize', 'note.write', 'production.update', 'delivery.manage']),
  member: new Set(['album.create', 'album.view', 'album.publish', 'production.update']),
  retoucher: new Set(['album.view', 'production.update']),
  guest_admin: new Set(['album.view', 'album.settings', 'album.publish', 'selection.finalize', 'production.update', 'delivery.manage']),
  customer: new Set(['album.view', 'selection.select', 'note.write']),
  participant: new Set(['album.view', 'selection.select', 'note.write']),
  finalizer: new Set(['album.view', 'selection.select', 'selection.finalize', 'note.write']),
}

export function canPerform(role: Role, action: Action): boolean {
  return permissions[role].has(action)
}
