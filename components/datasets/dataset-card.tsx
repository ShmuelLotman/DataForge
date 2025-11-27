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
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(date))
  }

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num)
  }

  return (
    <Card
      className={cn(
        'group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm',
        'hover:border-primary/30 hover:bg-card/80 transition-all duration-300',
        'animate-in fade-in slide-in-from-bottom-4'
      )}
      style={{
        animationDelay: `${index * 100}ms`,
        animationFillMode: 'backwards',
      }}
    >
      {/* Subtle gradient overlay on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

      <CardContent className="relative p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Database className="h-6 w-6 text-primary" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-lg truncate text-foreground">
                  {dataset.name}
                </h3>
                {dataset.canonicalSchema && (
                  <Badge
                    variant="secondary"
                    className="shrink-0 text-xs bg-primary/10 text-primary border-primary/20"
                  >
                    {dataset.canonicalSchema.length} cols
                  </Badge>
                )}
              </div>

              {dataset.description && (
                <p className="text-sm text-muted-foreground line-clamp-1 mb-3">
                  {dataset.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>{dataset.fileCount} files</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Rows3 className="h-3.5 w-3.5" />
                  <span>{formatNumber(dataset.rowCount)} rows</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{formatDate(dataset.updatedAt)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link href={`/visualize/${dataset.id}`}>
              <Button
                variant="secondary"
                size="sm"
                className="bg-primary/10 text-primary hover:bg-primary/20 border-0"
              >
                <BarChart3 className="h-4 w-4 mr-1.5" />
                Visualize
              </Button>
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
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
        </div>
      </CardContent>
    </Card>
  )
}
