'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Navigation } from '@/components/ui/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChatSidebar } from '@/components/ai-chat/chat-sidebar'
import { ChartCanvas } from './chart-canvas'
import {
  ArrowLeft,
  Database,
  Rows3,
  PanelRightClose,
  PanelRightOpen,
  Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import {
  useChartDataQuery,
  chartConfigToQueryConfig,
} from '@dataforge/query-hooks'
import type { Dataset, ChartConfig } from '@dataforge/types'

interface AIVisualizeClientProps {
  dataset: Dataset
}

export function AIVisualizeClient({ dataset }: AIVisualizeClientProps) {
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Query chart data when config changes
  const queryConfig = chartConfig ? chartConfigToQueryConfig(chartConfig) : null
  const { data: chartData = [], isLoading: chartLoading } = useChartDataQuery(
    dataset.id,
    queryConfig!,
    { enabled: !!queryConfig }
  )

  const handleChartUpdate = useCallback((config: ChartConfig) => {
    setChartConfig(config)
  }, [])

  return (
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div
        className="fixed inset-0 opacity-30 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.02) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.02) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />
      <div className="fixed top-0 left-1/4 w-[800px] h-[800px] bg-primary/5 rounded-full blur-[150px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px] pointer-events-none" />

      <Navigation />

      <main className="relative pt-16 h-screen flex flex-col">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="shrink-0 px-6 py-4 border-b border-border/50 bg-background/80 backdrop-blur-xl"
        >
          <div className="flex items-center justify-between max-w-[2000px] mx-auto">
            <div className="flex items-center gap-4">
              <Link href={`/visualize/${dataset.id}`}>
                <Button variant="ghost" size="sm" className="-ml-2">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>

              <div className="h-6 w-px bg-border" />

              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
                  <Database className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="font-semibold">{dataset.name}</h1>
                    <Badge
                      variant="secondary"
                      className="bg-primary/10 text-primary border-primary/20"
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      AI Mode
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Rows3 className="h-3 w-3" />
                      {dataset.rowCount.toLocaleString()} rows
                    </span>
                    <span>{dataset.canonicalSchema?.length || 0} columns</span>
                  </div>
                </div>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden"
            >
              {sidebarOpen ? (
                <PanelRightClose className="h-5 w-5" />
              ) : (
                <PanelRightOpen className="h-5 w-5" />
              )}
            </Button>
          </div>
        </motion.header>

        {/* Main Content */}
        <div className="flex-1 flex min-h-0">
          {/* Chart Canvas */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex-1 p-6"
          >
            <ChartCanvas
              config={chartConfig}
              data={chartData}
              isLoading={chartLoading}
            />
          </motion.div>

          {/* Chat Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{
              opacity: sidebarOpen ? 1 : 0,
              x: sidebarOpen ? 0 : 20,
              width: sidebarOpen ? 400 : 0,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="shrink-0 overflow-hidden"
          >
            <ChatSidebar
              datasetId={dataset.id}
              onChartUpdate={handleChartUpdate}
            />
          </motion.div>
        </div>
      </main>
    </div>
  )
}
