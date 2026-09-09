export function isTripOwnerRole(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

export function userIsTripOwner(
  userId: string | null | undefined,
  members: ReadonlyArray<{ user_id: string; role: string }>,
): boolean {
  if (!userId) return false
  return members.some(m => m.user_id === userId && isTripOwnerRole(m.role))
}
