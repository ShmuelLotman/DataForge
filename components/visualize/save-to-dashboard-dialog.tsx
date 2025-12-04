'use client'

import { useState, useEffect } from 'react'
import type { ChartConfig, Dashboard, ChartType, BucketType } from '@/lib/types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Save,
  Plus,
  LayoutDashboard,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface SaveToDashboardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  datasetId: string
  chartConfig: {
    chartType: ChartType
    xAxis: string
    yAxis: string[]
    groupBy: string
    bucket: BucketType
  }
}

export function SaveToDashboardDialog({
  open,
  onOpenChange,
  datasetId,
  chartConfig,
}: SaveToDashboardDialogProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'existing' | 'new'>('existing')
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [isLoadingDashboards, setIsLoadingDashboards] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Panel title
  const [panelTitle, setPanelTitle] = useState('')

  // Existing dashboard selection
  const [selectedDashboardId, setSelectedDashboardId] = useState<string>('')

  // New dashboard fields
  const [newDashboardName, setNewDashboardName] = useState('')
  const [newDashboardDescription, setNewDashboardDescription] = useState('')

  // Fetch dashboards for this dataset when dialog opens
  useEffect(() => {
    if (open) {
      fetchDashboards()
    }
  }, [open, datasetId])

  const fetchDashboards = async () => {
    setIsLoadingDashboards(true)
    try {
      const res = await fetch('/api/dashboards')
      if (!res.ok) throw new Error('Failed to fetch dashboards')
      const allDashboards: Dashboard[] = await res.json()
      // Filter to only dashboards for this dataset
      const datasetDashboards = allDashboards.filter(
        (d) => d.datasetId === datasetId
      )
      setDashboards(datasetDashboards)

      // Auto-switch to new tab if no dashboards exist for this dataset
      if (datasetDashboards.length === 0) {
        setActiveTab('new')
      }
    } catch (error) {
      console.error('Error fetching dashboards:', error)
      toast.error('Failed to load dashboards')
    } finally {
      setIsLoadingDashboards(false)
    }
  }

  const handleSave = async () => {
    if (!panelTitle.trim()) {
      toast.error('Please enter a panel title')
      return
    }

    if (activeTab === 'existing' && !selectedDashboardId) {
      toast.error('Please select a dashboard')
      return
    }

    if (activeTab === 'new' && !newDashboardName.trim()) {
      toast.error('Please enter a dashboard name')
      return
    }

    if (chartConfig.xAxis === 'none' || chartConfig.yAxis.length === 0) {
      toast.error('Please configure the chart before saving')
      return
    }

    setIsSaving(true)
    try {
      let dashboardId = selectedDashboardId

      // Create new dashboard if needed
      if (activeTab === 'new') {
        const createRes = await fetch('/api/dashboards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newDashboardName.trim(),
            description: newDashboardDescription.trim() || undefined,
            datasetId,
          }),
        })

        if (!createRes.ok) {
          const error = await createRes.json()
          throw new Error(error.error || 'Failed to create dashboard')
        }

        const newDashboard = await createRes.json()
        dashboardId = newDashboard.id
      }

      // Build the chart config
      const config: ChartConfig = {
        chartType: chartConfig.chartType,
        xAxis: chartConfig.xAxis,
        yAxis: chartConfig.yAxis,
        groupBy: chartConfig.groupBy !== 'none' ? chartConfig.groupBy : null,
        bucket: chartConfig.bucket,
      }

      // Add panel to dashboard
      const panelRes = await fetch(`/api/dashboards/${dashboardId}/panels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: panelTitle.trim(),
          config,
        }),
      })

      if (!panelRes.ok) {
        const error = await panelRes.json()
        throw new Error(error.error || 'Failed to add panel')
      }

      toast.success(
        activeTab === 'new'
          ? 'Dashboard created and panel added!'
          : 'Panel added to dashboard!',
        {
          action: {
            label: 'View Dashboard',
            onClick: () => router.push(`/dashboard/${dashboardId}`),
          },
        }
      )

      resetForm()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to save to dashboard'
      )
    } finally {
      setIsSaving(false)
    }
  }

  const resetForm = () => {
    setPanelTitle('')
    setSelectedDashboardId('')
    setNewDashboardName('')
    setNewDashboardDescription('')
    setActiveTab('existing')
  }

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetForm()
    }
    onOpenChange(newOpen)
  }

  const isConfigValid =
    chartConfig.xAxis !== 'none' && chartConfig.yAxis.length > 0

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Save to Dashboard
          </DialogTitle>
          <DialogDescription>
            Save this visualization as a panel on an existing dashboard or
            create a new one.
          </DialogDescription>
        </DialogHeader>

        {!isConfigValid ? (
          <div className="py-8 text-center">
            <p className="text-muted-foreground">
              Please configure your chart first by selecting X-axis and Y-axis
              values.
            </p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Panel Title */}
            <div className="space-y-2">
              <Label htmlFor="panel-title">Panel Title</Label>
              <Input
                id="panel-title"
                placeholder="e.g., Monthly Revenue by Region"
                value={panelTitle}
                onChange={(e) => setPanelTitle(e.target.value)}
                autoFocus
              />
            </div>

            {/* Dashboard Selection Tabs */}
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as 'existing' | 'new')}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="existing"
                  disabled={dashboards.length === 0}
                >
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Existing
                </TabsTrigger>
                <TabsTrigger value="new">
                  <Plus className="h-4 w-4 mr-2" />
                  New Dashboard
                </TabsTrigger>
              </TabsList>

              <TabsContent value="existing" className="space-y-4 mt-4">
                {isLoadingDashboards ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : dashboards.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <p>No dashboards found for this dataset.</p>
                    <p className="text-sm mt-1">
                      Create a new dashboard instead.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label>Select Dashboard</Label>
                    <Select
                      value={selectedDashboardId}
                      onValueChange={setSelectedDashboardId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a dashboard..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dashboards.map((dashboard) => (
                          <SelectItem key={dashboard.id} value={dashboard.id}>
                            <div className="flex items-center gap-2">
                              <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                              {dashboard.name}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="new" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="dashboard-name">Dashboard Name</Label>
                  <Input
                    id="dashboard-name"
                    placeholder="e.g., Q4 Sales Analysis"
                    value={newDashboardName}
                    onChange={(e) => setNewDashboardName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dashboard-description">
                    Description (optional)
                  </Label>
                  <Textarea
                    id="dashboard-description"
                    placeholder="Brief description of this dashboard..."
                    value={newDashboardDescription}
                    onChange={(e) => setNewDashboardDescription(e.target.value)}
                    rows={2}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              isSaving ||
              !isConfigValid ||
              !panelTitle.trim() ||
              (activeTab === 'existing' && !selectedDashboardId) ||
              (activeTab === 'new' && !newDashboardName.trim())
            }
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {activeTab === 'new' ? 'Create & Save' : 'Save Panel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

