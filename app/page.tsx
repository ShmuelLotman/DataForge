import { Navigation } from '@/components/ui/navigation'
import { DatasetList } from '@/components/datasets/dataset-list'

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Background Pattern */}
      <div className="fixed inset-0 grid-pattern opacity-50 pointer-events-none" />

      {/* Gradient Orbs */}
      <div className="fixed top-0 right-0 w-[600px] h-[600px] bg-primary/10 rounded-full blur-3xl opacity-20 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[400px] h-[400px] bg-chart-2/10 rounded-full blur-3xl opacity-20 pointer-events-none" />

      <Navigation />

      <main className="relative pt-24 pb-16 px-6">
        <div className="mx-auto max-w-6xl">
          <DatasetList />
        </div>
      </main>
    </div>
  )
}
