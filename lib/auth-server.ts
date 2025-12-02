import { auth } from './auth'
import { headers } from 'next/headers'

export async function getSession() {
  const headersList = await headers()
  const session = await auth.api.getSession({
    headers: headersList,
  })
  return session
}

export async function requireAuth() {
  const session = await getSession()
  if (!session?.user) {
    throw new Error('Unauthorized')
  }
  return session
}
