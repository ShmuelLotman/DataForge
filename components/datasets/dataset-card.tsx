'use client'

import type { Dataset } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Database,
  FileSpreadsheet,
  Rows3,
  Calendar,
  MoreHorizontal,
  BarChart3,
  Trash2,
  Pencil,
  Upload,
  Sparkles,
  ArrowRight,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface DatasetCardProps {
  dataset: Dataset
  onDelete?: (id: string) => void
  index?: number
}

export function DatasetCard({
  dataset,
  onDelete,
  index = 0,
}: DatasetCardProps) {
  const hasData = dataset.rowCount > 0

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date))
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(num)
  }

  return (
    <Card
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden border border-border/50 bg-card hover:bg-muted/10 transition-all duration-300',
        'hover:shadow-xl hover:border-primary/20 hover:-translate-y-1',
        'h-[260px]' // Increased height for better spacing
      )}
    >
      {/* Subtle Gradient Mesh Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="p-6 flex flex-col h-full relative z-10">
        {/* Top Row: Icon & Menu */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
            <Database className="h-6 w-6" />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem>
                <Pencil className="h-4 w-4 mr-2" />
                Edit Details
              </DropdownMenuItem>
              <Link href={`/upload?dataset=${dataset.id}`}>
                <DropdownMenuItem>
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Add Files
                </DropdownMenuItem>
              </Link>
              {hasData && (
                <Link href={`/visualize/${dataset.id}`}>
                  <DropdownMenuItem>
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Visualize
                  </DropdownMenuItem>
                </Link>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(dataset.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Dataset
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Middle: Title & Description */}
        <div className="flex-1 min-h-0 space-y-3">
          <Link
            href={
              hasData
                ? `/visualize/${dataset.id}`
                : `/upload?dataset=${dataset.id}`
            }
            className="block group-hover:text-primary transition-colors"
          >
            <h3 className="font-heading font-semibold text-xl leading-tight truncate">
              {dataset.name}
            </h3>
          </Link>
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {dataset.description || 'No description provided.'}
          </p>
        </div>

        {/* Bottom: Stats & Action */}
        <div className="mt-6 pt-5 border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2" title="Row count">
              <Rows3 className="h-4 w-4" />
              <span>{formatNumber(dataset.rowCount)}</span>
            </div>
            <div className="flex items-center gap-2" title="Last updated">
              <Calendar className="h-4 w-4" />
              <span>{formatDate(dataset.updatedAt)}</span>
            </div>
          </div>

          {/* Hover Action - Replaces stats on hover if we want, or just sits there. 
                 Let's make it a subtle arrow that lights up. */}
          <Link
            href={
              hasData
                ? `/visualize/${dataset.id}`
                : `/upload?dataset=${dataset.id}`
            }
          >
            <div className="flex items-center gap-2 text-sm font-medium text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ml-4">
              {hasData ? 'Visualize' : 'Add Data'}
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>
        </div>
      </div>
    </Card>
  )
}
