'use client'

import { useState } from 'react'
import type {
  DashboardPanel,
  DashboardLayoutConfig,
  Dataset,
} from '@/lib/types'
import { DEFAULT_DASHBOARD_LAYOUT } from '@/lib/types'
import { DashboardPanelComponent } from './dashboard-panel'
import { Button } from '@/components/ui/button'
import { LayoutGrid, Columns2, Columns3, Columns4 } from 'lucide-react'

interface PanelGridProps {
  panels: DashboardPanel[]
  dataset: Dataset
  onEditPanel: (panel: DashboardPanel) => void
  onDeletePanel: (panelId: string) => void
  onExpandPanel: (panel: DashboardPanel) => void
}

export function PanelGrid({
  panels,
  dataset,
  onEditPanel,
  onDeletePanel,
  onExpandPanel,
}: PanelGridProps) {
  // Layout is UI state, not persisted
  const [layout, setLayout] = useState<DashboardLayoutConfig>(
    DEFAULT_DASHBOARD_LAYOUT
  )

  const columnIcons = {
    1: LayoutGrid,
    2: Columns2,
    3: Columns3,
    4: Columns4,
  }

  const sortedPanels = [...panels].sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className="space-y-4">
      {/* Layout Controls */}
      <div className="flex items-center gap-4 justify-end">
        <span className="text-sm text-muted-foreground">Layout:</span>
        <div className="flex gap-1">
          {([1, 2, 3, 4] as const).map((cols) => {
            const Icon = columnIcons[cols]
            return (
              <Button
                key={cols}
                variant={layout.columns === cols ? 'default' : 'outline'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setLayout({ ...layout, columns: cols })}
                aria-label={`${cols} column${cols > 1 ? 's' : ''}`}
              >
                <Icon className="h-4 w-4" />
              </Button>
            )
          })}
        </div>
      </div>

      {/* Panel Grid */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${layout.columns}, 1fr)`,
          gap: `${layout.gap}px`,
        }}
      >
        {sortedPanels.map((panel, index) => (
          <div
            key={panel.id}
            className="animate-in fade-in slide-in-from-bottom-2"
            style={{
              minHeight: `${layout.rowHeight}px`,
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'backwards',
            }}
          >
            <DashboardPanelComponent
              panel={panel}
              dataset={dataset}
              onEdit={onEditPanel}
              onDelete={onDeletePanel}
              onExpand={onExpandPanel}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
