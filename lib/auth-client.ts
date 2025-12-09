'use client'

import { createAuthClient } from 'better-auth/react'

// Get base URL - use NEXT_PUBLIC_APP_URL or fallback to current origin for client-side
function getBaseURL() {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL
  }
  // In browser, use current origin (works automatically on Vercel)
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  return 'http://localhost:3000'
}

export const authClient = createAuthClient({
  baseURL: getBaseURL(),
})

export const { signIn, signUp, signOut, useSession } = authClient

