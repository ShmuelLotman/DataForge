'use client'

import type { DashboardWithDataset } from '@/lib/types'
import { Card, CardContent } from '@/components/ui/card'
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
} from 'lucide-react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'

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
      className="group hover:border-primary/30 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4"
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'backwards',
      }}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <Link href={`/dashboard/${dashboard.id}`} className="flex-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <LayoutDashboard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {dashboard.name}
                </h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Database className="h-3 w-3" />
                  {dashboard.dataset.name}
                </div>
              </div>
            </div>
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
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

        {dashboard.description && (
          <p className="mt-3 text-sm text-muted-foreground line-clamp-2">
            {dashboard.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {dashboard.panelCount} panel{dashboard.panelCount !== 1 ? 's' : ''}
          </span>
          <span>
            Updated{' '}
            {formatDistanceToNow(new Date(dashboard.updatedAt), {
              addSuffix: true,
            })}
          </span>
        </div>
      </CardContent>
    </Card>
  )
}


