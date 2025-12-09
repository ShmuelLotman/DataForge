'use client'

import type { DashboardWithDataset } from '@/lib/types'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MoreHorizontal,
  LayoutDashboard,
  Pencil,
  Trash2,
  Copy,
  Database,
  Calendar,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface DashboardCardProps {
  dashboard: DashboardWithDataset
  onEdit: (dashboard: DashboardWithDataset) => void
  onDelete: (id: string) => void
  onDuplicate: (dashboard: DashboardWithDataset) => void
  index?: number
}

export function DashboardCard({
  dashboard,
  onEdit,
  onDelete,
  onDuplicate,
  index = 0,
}: DashboardCardProps) {
  return (
    <Card
      className={cn(
        'group relative flex flex-col justify-between overflow-hidden border border-border/50 bg-card hover:bg-muted/10 transition-all duration-300',
        'hover:shadow-xl hover:border-primary/20 hover:-translate-y-1',
        'h-[260px]'
      )}
    >
      {/* Subtle Gradient Mesh Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="p-6 flex flex-col h-full relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
            <Link href={`/dashboard/${dashboard.id}`}>
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-secondary/50 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                    <LayoutDashboard className="h-6 w-6" />
                </div>
            </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                aria-label="Dashboard actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(dashboard)}>
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDuplicate(dashboard)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onDelete(dashboard.id)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 space-y-3">
          <Link href={`/dashboard/${dashboard.id}`} className="block group-hover:text-primary transition-colors">
            <h3 className="font-heading font-semibold text-xl leading-tight truncate">
              {dashboard.name}
            </h3>
          </Link>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
             <Database className="h-3.5 w-3.5" />
             <span className="truncate max-w-[200px]">{dashboard.dataset.name}</span>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {dashboard.description || "No description provided."}
          </p>
        </div>

        {/* Footer Info */}
        <div className="mt-6 pt-5 border-t border-border/40 flex items-center justify-between">
          <div className="flex items-center gap-5 text-sm font-medium text-muted-foreground">
             <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                <span>{dashboard.panelCount} panels</span>
             </div>
             <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                    {formatDistanceToNow(new Date(dashboard.updatedAt), {
                        addSuffix: true,
                    })}
                </span>
             </div>
          </div>
          
           <Link href={`/dashboard/${dashboard.id}`}>
                <div className="flex items-center gap-2 text-sm font-medium text-primary opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300">
                    Open
                    <ArrowRight className="h-4 w-4" />
                </div>
             </Link>
        </div>
      </div>
    </Card>
  )
}
