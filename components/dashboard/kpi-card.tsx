'use client'

import { useMemo } from 'react'
import type { ChartConfig } from '@/lib/types'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ============================================
// TYPES
// ============================================

interface KPICardProps {
  /** The aggregated value to display */
  value: number | null | undefined
  /** Configuration for the KPI */
  config: ChartConfig
  /** Optional comparison value (e.g., previous period) */
  comparisonValue?: number | null
  /** Optional comparison label */
  comparisonLabel?: string
  /** Height of the card */
  height?: string | number
  /** Additional class names */
  className?: string
}

// ============================================
// FORMATTERS
// ============================================

function formatValue(
  value: number | null | undefined,
  format?: 'number' | 'currency' | 'percent'
): string {
  if (value === null || value === undefined) return '—'

  switch (format) {
    case 'currency':
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value)

    case 'percent':
      return new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)

    case 'number':
    default:
      // Format large numbers with abbreviations
      if (Math.abs(value) >= 1_000_000_000) {
        return `${(value / 1_000_000_000).toFixed(1)}B`
      }
      if (Math.abs(value) >= 1_000_000) {
        return `${(value / 1_000_000).toFixed(1)}M`
      }
      if (Math.abs(value) >= 1_000) {
        return `${(value / 1_000).toFixed(1)}K`
      }
      return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 0,
      }).format(value)
  }
}

function formatChange(current: number, previous: number): string {
  if (previous === 0) return '+∞%'
  const change = ((current - previous) / Math.abs(previous)) * 100
  const sign = change >= 0 ? '+' : ''
  return `${sign}${change.toFixed(1)}%`
}

// ============================================
// COMPONENT
// ============================================

export function KPICard({
  value,
  config,
  comparisonValue,
  comparisonLabel = 'vs previous period',
  height = '100%',
  className,
}: KPICardProps) {
  // Calculate change percentage if comparison provided
  const change = useMemo(() => {
    if (
      value === null ||
      value === undefined ||
      comparisonValue === null ||
      comparisonValue === undefined
    ) {
      return null
    }
    return {
      value: value - comparisonValue,
      percentage: comparisonValue !== 0
        ? ((value - comparisonValue) / Math.abs(comparisonValue)) * 100
        : 0,
    }
  }, [value, comparisonValue])

  // Determine trend direction
  const trend = useMemo(() => {
    if (!change) return 'neutral'
    if (change.value > 0) return 'up'
    if (change.value < 0) return 'down'
    return 'neutral'
  }, [change])

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  const formattedValue = formatValue(value, config.format)
  const label = config.label || config.yAxis?.[0] || 'Value'

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-6 rounded-xl',
        'bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-sm',
        'border border-border/30',
        className
      )}
      style={{ height }}
    >
      {/* Label */}
      <div className="text-sm font-medium text-muted-foreground mb-2 text-center">
        {label}
      </div>

      {/* Main Value */}
      <div className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
        {formattedValue}
      </div>

      {/* Comparison / Trend */}
      {change !== null && (
        <div
          className={cn(
            'flex items-center gap-1.5 text-sm font-medium',
            trend === 'up' && 'text-emerald-500',
            trend === 'down' && 'text-rose-500',
            trend === 'neutral' && 'text-muted-foreground'
          )}
        >
          <TrendIcon className="h-4 w-4" />
          <span>{formatChange(value!, comparisonValue!)}</span>
          <span className="text-muted-foreground font-normal ml-1">
            {comparisonLabel}
          </span>
        </div>
      )}

      {/* No comparison - show aggregation type */}
      {change === null && config.aggregation && (
        <div className="text-xs text-muted-foreground uppercase tracking-wider">
          {config.aggregation === 'count_distinct' ? 'Unique Count' : config.aggregation}
        </div>
      )}
    </div>
  )
}

// ============================================
// MINI KPI (for dashboard grid)
// ============================================

interface MiniKPIProps {
  value: number | null | undefined
  label: string
  format?: 'number' | 'currency' | 'percent'
  trend?: 'up' | 'down' | 'neutral'
  changePercent?: number
  className?: string
}

export function MiniKPI({
  value,
  label,
  format,
  trend,
  changePercent,
  className,
}: MiniKPIProps) {
  const formattedValue = formatValue(value, format)
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus

  return (
    <div
      className={cn(
        'flex flex-col p-4 rounded-lg bg-card/50 border border-border/30',
        className
      )}
    >
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold">{formattedValue}</span>
        {trend && changePercent !== undefined && (
          <span
            className={cn(
              'flex items-center text-xs font-medium',
              trend === 'up' && 'text-emerald-500',
              trend === 'down' && 'text-rose-500',
              trend === 'neutral' && 'text-muted-foreground'
            )}
          >
            <TrendIcon className="h-3 w-3 mr-0.5" />
            {changePercent > 0 ? '+' : ''}
            {changePercent.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================
// KPI ROW (for summary cards at top of dashboard)
// ============================================

interface KPIRowProps {
  kpis: Array<{
    value: number | null | undefined
    label: string
    format?: 'number' | 'currency' | 'percent'
    trend?: 'up' | 'down' | 'neutral'
    changePercent?: number
  }>
  className?: string
}

export function KPIRow({ kpis, className }: KPIRowProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        kpis.length === 2 && 'grid-cols-2',
        kpis.length === 3 && 'grid-cols-3',
        kpis.length >= 4 && 'grid-cols-2 md:grid-cols-4',
        className
      )}
    >
      {kpis.map((kpi, index) => (
        <MiniKPI
          key={index}
          value={kpi.value}
          label={kpi.label}
          format={kpi.format}
          trend={kpi.trend}
          changePercent={kpi.changePercent}
        />
      ))}
    </div>
  )
}

