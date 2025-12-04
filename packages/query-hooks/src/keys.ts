/**
 * Query Key Factory
 *
 * Centralized query key management for consistent cache invalidation.
 * Uses factory pattern recommended by TanStack Query.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/query-keys
 */

export const queryKeys = {
  // ============================================
  // DATASETS
  // ============================================
  datasets: {
    all: ['datasets'] as const,
    lists: () => [...queryKeys.datasets.all, 'list'] as const,
    list: (filters?: { search?: string }) =>
      [...queryKeys.datasets.lists(), filters] as const,
    details: () => [...queryKeys.datasets.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.datasets.details(), id] as const,
    schema: (id: string) =>
      [...queryKeys.datasets.detail(id), 'schema'] as const,
    files: (id: string) => [...queryKeys.datasets.detail(id), 'files'] as const,
  },

  // ============================================
  // DASHBOARDS
  // ============================================
  dashboards: {
    all: ['dashboards'] as const,
    lists: () => [...queryKeys.dashboards.all, 'list'] as const,
    list: (filters?: { search?: string; datasetId?: string }) =>
      [...queryKeys.dashboards.lists(), filters] as const,
    details: () => [...queryKeys.dashboards.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.dashboards.details(), id] as const,
  },

  // ============================================
  // PANELS
  // ============================================
  panels: {
    all: ['panels'] as const,
    byDashboard: (dashboardId: string) =>
      [...queryKeys.panels.all, 'dashboard', dashboardId] as const,
    detail: (dashboardId: string, panelId: string) =>
      [...queryKeys.panels.byDashboard(dashboardId), panelId] as const,
  },

  // ============================================
  // CHART DATA QUERIES
  // ============================================
  chartData: {
    all: ['chartData'] as const,
    query: <T extends object>(datasetId: string, config: T) =>
      [...queryKeys.chartData.all, datasetId, config] as const,
  },
} as const

// Type helper for extracting query key types
export type QueryKeys = typeof queryKeys
