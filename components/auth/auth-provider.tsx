'use client'

import { ReactNode } from 'react'
import { authClient } from '@/lib/auth-client'

export function AuthProvider({ children }: { children: ReactNode }) {
  // better-auth/react handles the provider internally via createAuthClient
  // This component is here for consistency and future extensibility
  return <>{children}</>
}


