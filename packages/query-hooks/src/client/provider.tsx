'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

interface QueryProviderProps {
  children: ReactNode
}

/**
 * Default query client configuration
 * 
 * - staleTime: 60s - Data is considered fresh for 60 seconds
 * - gcTime: 5 minutes - Unused data is garbage collected after 5 minutes
 * - retry: 1 - Only retry failed requests once
 * - refetchOnWindowFocus: true - Refetch when window regains focus (good UX)
 */
function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 60 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0, // Don't retry mutations by default
      },
    },
  })
}

/**
 * QueryProvider component
 * 
 * Wraps the application with TanStack Query context.
 * Creates a new QueryClient instance per request (for SSR safety).
 * 
 * @example
 * ```tsx
 * // In your root layout.tsx
 * import { QueryProvider } from '@dataforge/query-hooks/provider'
 * 
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <QueryProvider>
 *           {children}
 *         </QueryProvider>
 *       </body>
 *     </html>
 *   )
 * }
 * ```
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // Create a new QueryClient for each request to avoid sharing state between users
  // This is important for SSR safety in Next.js
  const [queryClient] = useState(() => createQueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

/**
 * Export QueryClient creator for advanced use cases
 */
export { createQueryClient }


