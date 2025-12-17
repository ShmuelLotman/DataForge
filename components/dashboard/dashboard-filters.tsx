'use client'

import { useState, useMemo } from 'react'
import type { ChartFilter, ColumnSchema } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Calendar,
  ChevronDown,
  Filter,
  X,
  Save,
  RotateCcw,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { createDateRangeFilter } from '@dataforge/query-hooks'

// ============================================
// TYPES
// ============================================

interface FilterBarProps {
  schema: ColumnSchema[]
  filters: ChartFilter[]
  onSetFilter: (filter: ChartFilter) => void
  onRemoveFilter: (column: string) => void
  onClearFilters: () => void
  onResetToDefaults: () => void
  onSaveAsDefaults: () => Promise<void>
  hasChanges: boolean
  isSaving: boolean
  /** Column values for multi-select filters (column -> values[]) */
  columnValues?: Record<string, string[]>
  /** Loading state for column values */
  isLoadingValues?: boolean
  className?: string
}

interface DateRangeFilterProps {
  column: ColumnSchema
  value?: ChartFilter
  onChange: (filter: ChartFilter) => void
  onClear: () => void
}

interface MultiSelectFilterProps {
  column: ColumnSchema
  value?: ChartFilter
  options: string[]
  onChange: (filter: ChartFilter) => void
  onClear: () => void
  isLoading?: boolean
}

// ============================================
// DATE RANGE FILTER
// ============================================

const DATE_PRESETS = [
  { label: 'Last 7 days', value: 'last7' },
  { label: 'Last 30 days', value: 'last30' },
  { label: 'Last 90 days', value: 'last90' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'Last month', value: 'lastMonth' },
  { label: 'This year', value: 'thisYear' },
  { label: 'Custom range', value: 'custom' },
] as const

type DatePreset = (typeof DATE_PRESETS)[number]['value']

function DateRangeFilter({
  column,
  value,
  onChange,
  onClear,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [preset, setPreset] = useState<DatePreset>('last30')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  // Parse current value to detect preset
  const currentRange = useMemo(() => {
    if (!value || value.op !== 'between' || !Array.isArray(value.value)) {
      return null
    }
    return {
      start: value.value[0] as string,
      end: value.value[1] as string,
    }
  }, [value])

  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset)
    if (newPreset !== 'custom') {
      const filter = createDateRangeFilter(
        column.id,
        newPreset as Parameters<typeof createDateRangeFilter>[1]
      )
      onChange(filter)
      setOpen(false)
    }
  }

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      onChange({
        column: column.id,
        op: 'between',
        value: [customStart, customEnd],
        type: 'date',
      })
      setOpen(false)
    }
  }

  const displayValue = currentRange
    ? `${currentRange.start} - ${currentRange.end}`
    : 'Select dates'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-2 border-dashed',
            value && 'border-primary/50 bg-primary/5'
          )}
          aria-label={`Filter by ${column.label}`}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span className="max-w-[150px] truncate">{column.label}</span>
          {value && (
            <>
              <span className="text-muted-foreground">:</span>
              <span className="font-medium text-primary max-w-[120px] truncate">
                {displayValue}
              </span>
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="p-3 border-b border-border/50">
          <h4 className="font-medium text-sm">{column.label}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select a date range
          </p>
        </div>

        <div className="p-3 space-y-3">
          {/* Presets */}
          <div className="grid grid-cols-2 gap-2">
            {DATE_PRESETS.filter((p) => p.value !== 'custom').map((p) => (
              <Button
                key={p.value}
                variant={preset === p.value ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs"
                onClick={() => handlePresetChange(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>

          {/* Custom Range */}
          <div className="pt-2 border-t border-border/50">
            <Label className="text-xs text-muted-foreground">
              Custom range
            </Label>
            <div className="flex gap-2 mt-2">
              <Input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 text-xs"
                aria-label="Start date"
              />
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 text-xs"
                aria-label="End date"
              />
            </div>
            <Button
              size="sm"
              className="w-full mt-2 h-8"
              onClick={handleCustomApply}
              disabled={!customStart || !customEnd}
            >
              Apply Custom Range
            </Button>
          </div>
        </div>

        {value && (
          <div className="p-3 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              <X className="h-3.5 w-3.5 mr-2" />
              Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ============================================
// MULTI-SELECT FILTER
// ============================================

function MultiSelectFilter({
  column,
  value,
  options,
  onChange,
  onClear,
  isLoading,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  // Get selected values from filter
  const selectedValues = useMemo(() => {
    if (!value) return []
    if (value.op === 'in' && Array.isArray(value.value)) {
      return value.value as string[]
    }
    if (value.op === 'eq') {
      return [value.value as string]
    }
    return []
  }, [value])

  // Filter options by search
  const filteredOptions = useMemo(() => {
    if (!search) return options
    const lower = search.toLowerCase()
    return options.filter((opt) => opt.toLowerCase().includes(lower))
  }, [options, search])

  const handleToggle = (optionValue: string) => {
    const newSelected = selectedValues.includes(optionValue)
      ? selectedValues.filter((v) => v !== optionValue)
      : [...selectedValues, optionValue]

    if (newSelected.length === 0) {
      onClear()
    } else if (newSelected.length === 1) {
      onChange({
        column: column.id,
        op: 'eq',
        value: newSelected[0],
      })
    } else {
      onChange({
        column: column.id,
        op: 'in',
        value: newSelected,
      })
    }
  }

  const handleSelectAll = () => {
    if (selectedValues.length === options.length) {
      onClear()
    } else {
      onChange({
        column: column.id,
        op: 'in',
        value: options,
      })
    }
  }

  const displayValue =
    selectedValues.length === 0
      ? 'All'
      : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues.length} selected`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-8 gap-2 border-dashed',
            selectedValues.length > 0 && 'border-primary/50 bg-primary/5'
          )}
          aria-label={`Filter by ${column.label}`}
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="max-w-[100px] truncate">{column.label}</span>
          {selectedValues.length > 0 && (
            <>
              <span className="text-muted-foreground">:</span>
              <span className="font-medium text-primary max-w-[100px] truncate">
                {displayValue}
              </span>
            </>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-3 border-b border-border/50">
          <h4 className="font-medium text-sm">{column.label}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Select one or more values
          </p>
        </div>

        {/* Search */}
        <div className="p-2 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
              aria-label={`Search ${column.label} values`}
            />
          </div>
        </div>

        {/* Options */}
        <div className="max-h-[200px] overflow-y-auto p-2">
          {isLoading ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              Loading...
            </div>
          ) : filteredOptions.length === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No options found
            </div>
          ) : (
            <>
              {/* Select All */}
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                onClick={handleSelectAll}
                onKeyDown={(e) => e.key === 'Enter' && handleSelectAll()}
                tabIndex={0}
                role="checkbox"
                aria-checked={selectedValues.length === options.length}
                aria-label="Select all"
              >
                <Checkbox
                  checked={selectedValues.length === options.length}
                  className="pointer-events-none"
                />
                <span className="text-sm font-medium">Select All</span>
              </div>

              <div className="h-px bg-border/50 my-1" />

              {/* Individual Options */}
              {filteredOptions.map((opt) => (
                <div
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
                  onClick={() => handleToggle(opt)}
                  onKeyDown={(e) => e.key === 'Enter' && handleToggle(opt)}
                  tabIndex={0}
                  role="checkbox"
                  aria-checked={selectedValues.includes(opt)}
                  aria-label={opt}
                >
                  <Checkbox
                    checked={selectedValues.includes(opt)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm truncate">{opt}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {selectedValues.length > 0 && (
          <div className="p-2 border-t border-border/50">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-muted-foreground hover:text-foreground"
              onClick={() => {
                onClear()
                setOpen(false)
              }}
            >
              <X className="h-3.5 w-3.5 mr-2" />
              Clear filter
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

// ============================================
// FILTER BAR
// ============================================

export function FilterBar({
  schema,
  filters,
  onSetFilter,
  onRemoveFilter,
  onClearFilters,
  onResetToDefaults,
  onSaveAsDefaults,
  hasChanges,
  isSaving,
  columnValues = {},
  isLoadingValues = false,
  className,
}: FilterBarProps) {
  // Separate date columns from dimension columns
  const { dateColumns, dimensionColumns } = useMemo(() => {
    const dates: ColumnSchema[] = []
    const dimensions: ColumnSchema[] = []

    schema.forEach((col) => {
      if (col.type === 'date') {
        dates.push(col)
      } else if (col.role === 'dimension' && col.type === 'string') {
        dimensions.push(col)
      }
    })

    return { dateColumns: dates, dimensionColumns: dimensions }
  }, [schema])

  // Get filter for a column
  const getFilter = (columnId: string) =>
    filters.find((f) => f.column === columnId)

  // Active filter count
  const activeFilterCount = filters.length

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 p-3 rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm',
        className
      )}
    >
      {/* Filter Icon & Label */}
      <div className="flex items-center gap-2 text-muted-foreground mr-1">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filters</span>
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
            {activeFilterCount}
          </Badge>
        )}
      </div>

      {/* Date Filters */}
      {dateColumns.map((col) => (
        <DateRangeFilter
          key={col.id}
          column={col}
          value={getFilter(col.id)}
          onChange={onSetFilter}
          onClear={() => onRemoveFilter(col.id)}
        />
      ))}

      {/* Dimension Filters */}
      {dimensionColumns.slice(0, 5).map((col) => (
        <MultiSelectFilter
          key={col.id}
          column={col}
          value={getFilter(col.id)}
          options={columnValues[col.id] || []}
          onChange={onSetFilter}
          onClear={() => onRemoveFilter(col.id)}
          isLoading={isLoadingValues}
        />
      ))}

      {/* More Filters Dropdown (if > 5 dimensions) */}
      {dimensionColumns.length > 5 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 border-dashed"
            >
              <span>More filters</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                +{dimensionColumns.length - 5}
              </Badge>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            {dimensionColumns.slice(5).map((col) => (
              <Button
                key={col.id}
                variant="ghost"
                size="sm"
                className="w-full justify-start h-8 text-sm"
                onClick={() => {
                  // This would open that specific filter
                  // For now, just show it's available
                }}
              >
                {col.label}
              </Button>
            ))}
          </PopoverContent>
        </Popover>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <div className="flex items-center gap-1">
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground hover:text-foreground"
            onClick={onClearFilters}
          >
            <X className="h-3.5 w-3.5 mr-1" />
            Clear all
          </Button>
        )}

        {hasChanges && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-foreground"
              onClick={onResetToDefaults}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onSaveAsDefaults}
              disabled={isSaving}
            >
              <Save className="h-3.5 w-3.5 mr-1" />
              {isSaving ? 'Saving...' : 'Save defaults'}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================
// ACTIVE FILTERS DISPLAY
// ============================================

interface ActiveFiltersProps {
  filters: ChartFilter[]
  schema: ColumnSchema[]
  onRemove: (column: string) => void
  onClear: () => void
  className?: string
}

export function ActiveFilters({
  filters,
  schema,
  onRemove,
  onClear,
  className,
}: ActiveFiltersProps) {
  if (filters.length === 0) return null

  const getColumnLabel = (columnId: string) => {
    const col = schema.find((c) => c.id === columnId)
    return col?.label || columnId
  }

  const formatFilterValue = (filter: ChartFilter) => {
    if (Array.isArray(filter.value)) {
      if (filter.op === 'between') {
        return `${filter.value[0]} to ${filter.value[1]}`
      }
      if (filter.value.length > 2) {
        return `${filter.value.slice(0, 2).join(', ')} +${
          filter.value.length - 2
        }`
      }
      return filter.value.join(', ')
    }
    return String(filter.value)
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <span className="text-xs text-muted-foreground">Active:</span>
      {filters.map((filter) => (
        <Badge
          key={filter.column}
          variant="secondary"
          className="gap-1 pr-1 cursor-pointer hover:bg-secondary/80"
          onClick={() => onRemove(filter.column)}
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onRemove(filter.column)}
          role="button"
          aria-label={`Remove ${getColumnLabel(filter.column)} filter`}
        >
          <span className="font-medium">{getColumnLabel(filter.column)}:</span>
          <span className="max-w-[100px] truncate">
            {formatFilterValue(filter)}
          </span>
          <X className="h-3 w-3 ml-0.5 opacity-60 hover:opacity-100" />
        </Badge>
      ))}
      {filters.length > 1 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={onClear}
        >
          Clear all
        </Button>
      )}
    </div>
  )
}

export { DateRangeFilter, MultiSelectFilter }
