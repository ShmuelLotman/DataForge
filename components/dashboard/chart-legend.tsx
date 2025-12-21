'use client'

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Search, Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface ChartLegendProps {
  items: Array<{
    key: string
    color: string
  }>
  hiddenKeys: Set<string>
  onToggle: (key: string) => void
  onToggleAll: (visible: boolean) => void
  className?: string
  /** Max height before scrolling */
  maxHeight?: number
  /** Number of items to show before collapsing */
  initialVisibleCount?: number
}

export function ChartLegend({
  items,
  hiddenKeys,
  onToggle,
  onToggleAll,
  className,
  maxHeight = 280,
  initialVisibleCount = 8,
}: ChartLegendProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const showSearch = items.length > 10
  const showExpandToggle = items.length > initialVisibleCount && !searchQuery

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items
    const query = searchQuery.toLowerCase()
    return items.filter((item) => item.key.toLowerCase().includes(query))
  }, [items, searchQuery])

  // Limit visible items if not expanded
  const visibleItems = useMemo(() => {
    if (isExpanded || searchQuery) return filteredItems
    return filteredItems.slice(0, initialVisibleCount)
  }, [filteredItems, isExpanded, searchQuery, initialVisibleCount])

  const hiddenCount = filteredItems.length - visibleItems.length
  const allVisible = hiddenKeys.size === 0
  const allHidden = hiddenKeys.size === items.length

  const handleToggleAll = () => {
    onToggleAll(allHidden)
  }

  return (
    <div
      className={cn(
        'flex flex-col border-l border-border/50 bg-card/30',
        className
      )}
      style={{ width: 180 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-medium text-muted-foreground">
          Categories
        </span>
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleToggleAll}
                aria-label={allVisible ? 'Hide all series' : 'Show all series'}
              >
                {allVisible ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{allVisible ? 'Hide all' : 'Show all'}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-border/50">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter..."
              className="h-7 pl-7 text-xs bg-background/50"
              aria-label="Filter categories"
            />
          </div>
        </div>
      )}

      {/* Legend Items */}
      <ScrollArea style={{ maxHeight }} className="flex-1">
        <div className="p-2 space-y-0.5">
          {visibleItems.map((item) => {
            const isHidden = hiddenKeys.has(item.key)
            return (
              <LegendItem
                key={item.key}
                label={item.key}
                color={item.color}
                isHidden={isHidden}
                onToggle={() => onToggle(item.key)}
              />
            )
          })}

          {/* Expand/Collapse toggle */}
          {showExpandToggle && hiddenCount > 0 && (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              aria-label={`Show ${hiddenCount} more categories`}
            >
              <ChevronDown className="h-3 w-3" />
              <span>{hiddenCount} more...</span>
            </button>
          )}

          {showExpandToggle && isExpanded && !searchQuery && (
            <button
              onClick={() => setIsExpanded(false)}
              className="flex items-center gap-1 w-full px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded transition-colors"
              aria-label="Show less categories"
            >
              <ChevronUp className="h-3 w-3" />
              <span>Show less</span>
            </button>
          )}

          {/* No results */}
          {filteredItems.length === 0 && searchQuery && (
            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
              No matches
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer with count */}
      <div className="px-3 py-1.5 border-t border-border/50 text-[10px] text-muted-foreground">
        {items.length - hiddenKeys.size} of {items.length} visible
      </div>
    </div>
  )
}

interface LegendItemProps {
  label: string
  color: string
  isHidden: boolean
  onToggle: () => void
}

function LegendItem({ label, color, isHidden, onToggle }: LegendItemProps) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-1 text-xs rounded transition-all',
              'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              isHidden && 'opacity-40'
            )}
            aria-label={`${isHidden ? 'Show' : 'Hide'} ${label}`}
            aria-pressed={!isHidden}
            tabIndex={0}
          >
            {/* Color swatch */}
            <span
              className={cn(
                'h-2.5 w-2.5 rounded-sm flex-shrink-0 transition-opacity',
                isHidden && 'opacity-30'
              )}
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            {/* Label - truncated */}
            <span
              className={cn(
                'truncate text-left flex-1',
                isHidden
                  ? 'text-muted-foreground line-through'
                  : 'text-foreground'
              )}
            >
              {label}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-[200px]">
          <p className="break-words">{label}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

