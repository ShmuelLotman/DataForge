'use client'
import { useState, useCallback, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { queryKeys } from '../keys'
import type {
  ChartFilter,
  Dashboard,
  DashboardWithPanels,
  ColumnSchema,
} from '@dataforge/types'

// ============================================
// TYPES
// ============================================

export interface FilterPreset {
  id: string
  name: string
  filters: ChartFilter[]
}

export interface UseDashboardFiltersOptions {
  /** Dashboard with default filters loaded */
  dashboard: DashboardWithPanels | null | undefined
  /** Dataset schema for filter validation */
  schema?: ColumnSchema[]
  /** Sync filters to URL search params */
  syncToUrl?: boolean
  /** Called when filters change */
  onFiltersChange?: (filters: ChartFilter[]) => void
}

export interface UseDashboardFiltersReturn {
  /** Current active filters (URL overrides DB defaults) */
  filters: ChartFilter[]
  /** Set all filters at once */
  setFilters: (filters: ChartFilter[]) => void
  /** Add or update a single filter */
  setFilter: (filter: ChartFilter) => void
  /** Remove a filter by column name */
  removeFilter: (column: string) => void
  /** Clear all filters */
  clearFilters: () => void
  /** Reset to dashboard default filters */
  resetToDefaults: () => void
  /** Save current filters as dashboard defaults */
  saveAsDefaults: () => Promise<void>
  /** Whether filters differ from defaults */
  hasChanges: boolean
  /** Whether save is in progress */
  isSaving: boolean
  /** Get filter for a specific column */
  getFilter: (column: string) => ChartFilter | undefined
  /** Check if a column has an active filter */
  hasFilter: (column: string) => boolean
  /** Get URL search params string for current filters */
  toUrlParams: () => string
  /** Merge filters with panel-specific filters */
  mergeWithPanelFilters: (panelFilters?: ChartFilter[]) => ChartFilter[]
}

// ============================================
// URL ENCODING/DECODING
// ============================================

/**
 * Encode filters to URL-safe string
 * Format: column:op:value,column:op:value
 * Arrays are joined with |
 */
function encodeFiltersToUrl(filters: ChartFilter[]): string {
  if (!filters.length) return ''

  return filters
    .map((f) => {
      const value = Array.isArray(f.value) ? f.value.join('|') : String(f.value)
      const parts = [f.column, f.op, encodeURIComponent(value)]
      if (f.type) parts.push(f.type)
      return parts.join(':')
    })
    .join(',')
}

/**
 * Decode filters from URL string
 */
function decodeFiltersFromUrl(urlString: string): ChartFilter[] {
  if (!urlString) return []

  try {
    return urlString.split(',').map((part) => {
      const [column, op, encodedValue, type] = part.split(':')
      const decodedValue = decodeURIComponent(encodedValue)

      // Check if value is an array (contains |)
      const value = decodedValue.includes('|')
        ? decodedValue.split('|')
        : decodedValue

      return {
        column,
        op: op as ChartFilter['op'],
        value,
        ...(type && { type: type as ChartFilter['type'] }),
      }
    })
  } catch {
    console.warn('Failed to decode filters from URL:', urlString)
    return []
  }
}

/**
 * Get filters from current URL search params
 */
function getFiltersFromUrl(): ChartFilter[] {
  if (typeof window === 'undefined') return []

  const params = new URLSearchParams(window.location.search)
  const filterParam = params.get('filters')
  return filterParam ? decodeFiltersFromUrl(filterParam) : []
}

/**
 * Update URL with filters without page reload
 */
function updateUrlWithFilters(filters: ChartFilter[]) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const encoded = encodeFiltersToUrl(filters)

  if (encoded) {
    url.searchParams.set('filters', encoded)
  } else {
    url.searchParams.delete('filters')
  }

  // Use replaceState to avoid adding to browser history for every filter change
  window.history.replaceState({}, '', url.toString())
}

// ============================================
// HOOK
// ============================================

/**
 * Manages dashboard filter state with URL sync and DB persistence
 *
 * @example
 * ```tsx
 * const {
 *   filters,
 *   setFilter,
 *   removeFilter,
 *   saveAsDefaults,
 *   hasChanges
 * } = useDashboardFilters({
 *   dashboard,
 *   schema: dataset.canonicalSchema,
 *   syncToUrl: true
 * })
 *
 * // Add a filter
 * setFilter({ column: 'Store', op: 'in', value: ['MO', 'BP'] })
 *
 * // Remove a filter
 * removeFilter('Store')
 *
 * // Save as defaults
 * await saveAsDefaults()
 * ```
 */
export function useDashboardFilters({
  dashboard,
  schema = [],
  syncToUrl = true,
  onFiltersChange,
}: UseDashboardFiltersOptions): UseDashboardFiltersReturn {
  const queryClient = useQueryClient()

  // Get default filters from dashboard
  const defaultFilters = useMemo(
    () => dashboard?.defaultFilters || [],
    [dashboard?.defaultFilters]
  )

  // Initialize filters: URL > DB defaults
  const [filters, setFiltersState] = useState<ChartFilter[]>(() => {
    if (syncToUrl) {
      const urlFilters = getFiltersFromUrl()
      if (urlFilters.length > 0) return urlFilters
    }
    return defaultFilters
  })

  // Sync from defaults when dashboard loads (if no URL filters)
  useEffect(() => {
    if (syncToUrl) {
      const urlFilters = getFiltersFromUrl()
      if (urlFilters.length > 0) {
        setFiltersState(urlFilters)
        return
      }
    }
    setFiltersState(defaultFilters)
  }, [defaultFilters, syncToUrl])

  // Update URL when filters change
  useEffect(() => {
    if (syncToUrl) {
      updateUrlWithFilters(filters)
    }
    onFiltersChange?.(filters)
  }, [filters, syncToUrl])

  // Save filters mutation
  const saveMutation = useMutation({
    mutationFn: async (newFilters: ChartFilter[]) => {
      if (!dashboard?.id) throw new Error('No dashboard')
      const { data } = await axios.patch<Dashboard>(
        `/api/dashboards/${dashboard.id}`,
        { defaultFilters: newFilters }
      )
      return data
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(
        queryKeys.dashboards.detail(dashboard!.id),
        (old: DashboardWithPanels | undefined) =>
          old ? { ...old, defaultFilters: data.defaultFilters } : undefined
      )
    },
  })

  // Set all filters
  const setFilters = useCallback((newFilters: ChartFilter[]) => {
    setFiltersState(newFilters)
  }, [])

  // Add or update a single filter
  const setFilter = useCallback((filter: ChartFilter) => {
    setFiltersState((prev) => {
      const existing = prev.findIndex((f) => f.column === filter.column)
      if (existing >= 0) {
        const updated = [...prev]
        updated[existing] = filter
        return updated
      }
      return [...prev, filter]
    })
  }, [])

  // Remove a filter
  const removeFilter = useCallback((column: string) => {
    setFiltersState((prev) => prev.filter((f) => f.column !== column))
  }, [])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFiltersState([])
  }, [])

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    setFiltersState(defaultFilters)
  }, [defaultFilters])

  // Save current filters as defaults
  const saveAsDefaults = useCallback(async () => {
    await saveMutation.mutateAsync(filters)
  }, [filters, saveMutation])

  // Check if filters differ from defaults
  const hasChanges = useMemo(() => {
    if (filters.length !== defaultFilters.length) return true
    return filters.some((f) => {
      const defaultFilter = defaultFilters.find((df) => df.column === f.column)
      if (!defaultFilter) return true
      return (
        f.op !== defaultFilter.op ||
        JSON.stringify(f.value) !== JSON.stringify(defaultFilter.value)
      )
    })
  }, [filters, defaultFilters])

  // Get filter for a column
  const getFilter = useCallback(
    (column: string) => filters.find((f) => f.column === column),
    [filters]
  )

  // Check if column has filter
  const hasFilter = useCallback(
    (column: string) => filters.some((f) => f.column === column),
    [filters]
  )

  // Get URL params string
  const toUrlParams = useCallback(() => encodeFiltersToUrl(filters), [filters])

  // Merge with panel-specific filters (panel filters take precedence)
  const mergeWithPanelFilters = useCallback(
    (panelFilters?: ChartFilter[]) => {
      if (!panelFilters?.length) return filters

      const merged = [...filters]
      for (const pf of panelFilters) {
        const existingIdx = merged.findIndex((f) => f.column === pf.column)
        if (existingIdx >= 0) {
          merged[existingIdx] = pf // Panel filter overrides
        } else {
          merged.push(pf)
        }
      }
      return merged
    },
    [filters]
  )

  return {
    filters,
    setFilters,
    setFilter,
    removeFilter,
    clearFilters,
    resetToDefaults,
    saveAsDefaults,
    hasChanges,
    isSaving: saveMutation.isPending,
    getFilter,
    hasFilter,
    toUrlParams,
    mergeWithPanelFilters,
  }
}

// ============================================
// HELPER HOOKS
// ============================================

/**
 * Hook to get date range filter values with presets
 */
export function useDateRangeFilter(filters: ChartFilter[], dateColumn: string) {
  const filter = filters.find((f) => f.column === dateColumn)

  const dateRange = useMemo(() => {
    if (!filter) return null
    if (filter.op === 'between' && Array.isArray(filter.value)) {
      return {
        start: filter.value[0] as string,
        end: filter.value[1] as string,
      }
    }
    return null
  }, [filter])

  const preset = useMemo(() => {
    if (!dateRange) return 'all'

    const today = new Date()
    const start = new Date(dateRange.start)
    const diffDays = Math.round(
      (today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    )

    if (diffDays <= 7) return 'last7'
    if (diffDays <= 30) return 'last30'
    if (diffDays <= 90) return 'last90'
    return 'custom'
  }, [dateRange])

  return { dateRange, preset }
}

/**
 * Creates a date range filter for common presets
 */
export function createDateRangeFilter(
  column: string,
  preset: 'last7' | 'last30' | 'last90' | 'thisMonth' | 'lastMonth' | 'thisYear'
): ChartFilter {
  const today = new Date()
  let start: Date
  let end: Date = today

  switch (preset) {
    case 'last7':
      start = new Date(today)
      start.setDate(start.getDate() - 7)
      break
    case 'last30':
      start = new Date(today)
      start.setDate(start.getDate() - 30)
      break
    case 'last90':
      start = new Date(today)
      start.setDate(start.getDate() - 90)
      break
    case 'thisMonth':
      start = new Date(today.getFullYear(), today.getMonth(), 1)
      break
    case 'lastMonth':
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      end = new Date(today.getFullYear(), today.getMonth(), 0)
      break
    case 'thisYear':
      start = new Date(today.getFullYear(), 0, 1)
      break
  }

  return {
    column,
    op: 'between',
    value: [start.toISOString().split('T')[0], end.toISOString().split('T')[0]],
    type: 'date',
  }
}

// ============================================
// COLUMN VALUES HOOK
// ============================================

/**
 * Fetches unique values for columns in a dataset
 * Used to populate multi-select filter dropdowns
 *
 * @example
 * ```tsx
 * const { data: columnValues, isLoading } = useColumnValuesQuery(
 *   datasetId,
 *   ['Store', 'Category', 'SubCategory']
 * )
 * // columnValues = { Store: ['MO', 'BP', 'LW'], Category: ['Meat', 'Dairy'], ... }
 * ```
 */
export function useColumnValuesQuery(
  datasetId: string,
  columns: string[],
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: ['columnValues', datasetId, columns.sort().join(',')],
    queryFn: async () => {
      if (!columns.length) return {}
      const { data } = await axios.get<Record<string, string[]>>(
        `/api/datasets/${datasetId}/column-values`,
        { params: { columns: columns.join(',') } }
      )
      return data
    },
    enabled: !!datasetId && columns.length > 0 && options?.enabled !== false,
    staleTime: 5 * 60 * 1000, // 5 minutes - column values don't change often
  })
}
