'use client'

import { useSession } from '@/lib/auth-client'
import { useEffect, useState } from 'react'

export function useAuth() {
  const { data: session, isPending } = useSession()
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!isPending) {
      setIsLoading(false)
    }
  }, [isPending])

  return {
    user: session?.user || null,
    session,
    isLoading,
    isAuthenticated: !!session?.user,
  }
}

