import type { AdminUser } from '../../api/admin'

const ROLE_LABEL: Record<AdminUser['role'], string> = { super_admin: 'Super admin', admin: 'Admin', user: 'User' }

export function RoleBadge({ role }: { role: AdminUser['role'] }) {
  return <span className={`badge${role === 'user' ? '' : ' badge-stale'}`}>{ROLE_LABEL[role]}</span>
}

export function StatusBadge({ active }: { active: boolean }) {
  return <span className={`badge ${active ? 'badge-fresh' : 'badge-bad'}`}>{active ? 'Active' : 'Inactive'}</span>
}
