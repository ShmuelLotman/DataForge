'use client'

import { useState, useMemo } from 'react'
import type { ColumnSchema, ChartFilter, TableConfig, TableColumnConfig } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  Download,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ============================================
// TYPES
// ============================================

interface DataTableProps {
  /** Data rows to display */
  data: Record<string, unknown>[]
  /** Schema for column definitions */
  schema: ColumnSchema[]
  /** Table configuration with format hints (optional) */
  tableConfig?: TableConfig
  /** Total row count (for pagination) */
  totalRows?: number
  /** Current page (0-indexed) */
  page?: number
  /** Rows per page */
  pageSize?: number
  /** Called when page changes */
  onPageChange?: (page: number) => void
  /** Called when page size changes */
  onPageSizeChange?: (size: number) => void
  /** Called when sort changes */
  onSortChange?: (column: string, direction: 'asc' | 'desc') => void
  /** Current sort column */
  sortColumn?: string
  /** Current sort direction */
  sortDirection?: 'asc' | 'desc'
  /** Loading state */
  isLoading?: boolean
  /** Active filters (for display) */
  filters?: ChartFilter[]
  /** Export handler */
  onExport?: () => void
  /** Height of the table container */
  height?: string | number
  /** Additional class names */
  className?: string
}

type SortDirection = 'asc' | 'desc' | null

// ============================================
// FORMATTERS
// ============================================

type FormatHint = 'number' | 'currency' | 'percent' | 'date' | 'text'

function formatCellValue(
  value: unknown,
  type: ColumnSchema['type'],
  formatHint?: FormatHint
): string {
  if (value === null || value === undefined) return '—'

  // Apply format hint if provided
  if (formatHint) {
    switch (formatHint) {
      case 'currency':
        const currencyNum = Number(value)
        if (isNaN(currencyNum)) return String(value)
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(currencyNum)

      case 'percent':
        const percentNum = Number(value)
        if (isNaN(percentNum)) return String(value)
        return new Intl.NumberFormat('en-US', {
          style: 'percent',
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        }).format(percentNum / 100)

      case 'date':
        const dateStr = String(value)
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) return dateStr
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })

      case 'number':
        const num = Number(value)
        if (isNaN(num)) return String(value)
        return new Intl.NumberFormat('en-US', {
          maximumFractionDigits: 2,
        }).format(num)

      case 'text':
        return String(value)
    }
  }

  // Fall back to type-based formatting
  switch (type) {
    case 'number':
      const num = Number(value)
      if (isNaN(num)) return String(value)
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 2,
      }).format(num)

    case 'date':
      const dateStr = String(value)
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })

    case 'boolean':
      return value ? 'Yes' : 'No'

    default:
      return String(value)
  }
}

// ============================================
// COMPONENT
// ============================================

export function DataTable({
  data,
  schema,
  tableConfig,
  totalRows,
  page = 0,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  sortColumn,
  sortDirection,
  isLoading = false,
  filters = [],
  onExport,
  height = 400,
  className,
}: DataTableProps) {
  // Build a map of column id -> format hint from tableConfig
  const formatHints = useMemo(() => {
    const hints = new Map<string, FormatHint>()
    if (tableConfig?.columns) {
      for (const col of tableConfig.columns) {
        if (col.format) {
          hints.set(col.id, col.format)
        }
      }
    }
    return hints
  }, [tableConfig])
  const [searchQuery, setSearchQuery] = useState('')
  const [localSort, setLocalSort] = useState<{
    column: string | null
    direction: SortDirection
  }>({ column: sortColumn || null, direction: sortDirection || null })

  // Use controlled sort if provided, otherwise use local
  const effectiveSort = sortColumn !== undefined 
    ? { column: sortColumn, direction: sortDirection || null }
    : localSort

  // Filter and sort data locally if no server-side handlers
  const processedData = useMemo(() => {
    let result = [...data]

    // Local search filter
    if (searchQuery) {
      const lower = searchQuery.toLowerCase()
      result = result.filter((row) =>
        Object.values(row).some((val) =>
          String(val).toLowerCase().includes(lower)
        )
      )
    }

    // Local sort (if no server-side sort)
    if (!onSortChange && effectiveSort.column && effectiveSort.direction) {
      const col = effectiveSort.column
      const dir = effectiveSort.direction
      result.sort((a, b) => {
        const aVal = a[col]
        const bVal = b[col]
        
        if (aVal === null || aVal === undefined) return 1
        if (bVal === null || bVal === undefined) return -1
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return dir === 'asc' ? aVal - bVal : bVal - aVal
        }
        
        const aStr = String(aVal)
        const bStr = String(bVal)
        return dir === 'asc' 
          ? aStr.localeCompare(bStr) 
          : bStr.localeCompare(aStr)
      })
    }

    return result
  }, [data, searchQuery, effectiveSort, onSortChange])

  // Pagination calculations
  const effectiveTotalRows = totalRows ?? processedData.length
  const totalPages = Math.ceil(effectiveTotalRows / pageSize)
  const startRow = page * pageSize + 1
  const endRow = Math.min((page + 1) * pageSize, effectiveTotalRows)

  // Handle sort click
  const handleSort = (columnId: string) => {
    const newDirection: SortDirection =
      effectiveSort.column === columnId
        ? effectiveSort.direction === 'asc'
          ? 'desc'
          : effectiveSort.direction === 'desc'
            ? null
            : 'asc'
        : 'asc'

    if (onSortChange && newDirection) {
      onSortChange(columnId, newDirection)
    } else {
      setLocalSort({
        column: newDirection ? columnId : null,
        direction: newDirection,
      })
    }
  }

  // Get sort icon for a column
  const getSortIcon = (columnId: string) => {
    if (effectiveSort.column !== columnId) {
      return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
    }
    if (effectiveSort.direction === 'asc') {
      return <ArrowUp className="h-3.5 w-3.5" />
    }
    if (effectiveSort.direction === 'desc') {
      return <ArrowDown className="h-3.5 w-3.5" />
    }
    return <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 mb-4">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
            aria-label="Search table"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Row count */}
          <span className="text-sm text-muted-foreground">
            {effectiveTotalRows.toLocaleString()} rows
          </span>

          {/* Export */}
          {onExport && (
            <Button
              variant="outline"
              size="sm"
              onClick={onExport}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className="rounded-lg border border-border/50 overflow-hidden"
        style={{ height }}
      >
        <div className="overflow-auto h-full">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-10">
              <TableRow>
                {schema.map((col) => (
                  <TableHead
                    key={col.id}
                    className={cn(
                      'whitespace-nowrap cursor-pointer select-none hover:bg-muted/50 transition-colors',
                      col.type === 'number' && 'text-right'
                    )}
                    onClick={() => handleSort(col.id)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && handleSort(col.id)}
                    role="columnheader"
                    aria-sort={
                      effectiveSort.column === col.id
                        ? effectiveSort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.label}</span>
                      {getSortIcon(col.id)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={schema.length}
                    className="h-32 text-center"
                  >
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Loading data...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : processedData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={schema.length}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No data found
                  </TableCell>
                </TableRow>
              ) : (
                processedData.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-muted/30">
                    {schema.map((col) => {
                      const formatHint = formatHints.get(col.id)
                      const isCurrency = formatHint === 'currency'
                      const isPercent = formatHint === 'percent'
                      return (
                        <TableCell
                          key={col.id}
                          className={cn(
                            'py-2',
                            (col.type === 'number' || isCurrency || isPercent) &&
                              'text-right font-mono'
                          )}
                        >
                          {formatCellValue(row[col.id], col.type, formatHint)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          {/* Page size selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows per page:</span>
            <Select
              value={String(pageSize)}
              onValueChange={(val) => onPageSizeChange?.(Number(val))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 25, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Page info */}
          <span className="text-sm text-muted-foreground">
            {startRow}-{endRow} of {effectiveTotalRows.toLocaleString()}
          </span>

          {/* Page controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(0)}
              disabled={page === 0}
              aria-label="First page"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm">
              Page {page + 1} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(page + 1)}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => onPageChange?.(totalPages - 1)}
              disabled={page >= totalPages - 1}
              aria-label="Last page"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

