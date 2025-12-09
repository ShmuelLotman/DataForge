'use client'

import { Navigation } from '@/components/ui/navigation'
import { DatasetList } from '@/components/datasets/dataset-list'
import { AuthGuard } from '@/components/auth/auth-guard'
import { Reveal } from '@/components/ui/reveal'

export default function Home() {
  return (
    <AuthGuard>
      <div className="min-h-screen bg-background overflow-hidden">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-primary/20 rounded-full blur-[120px] opacity-20 pointer-events-none -translate-y-1/2 translate-x-1/2" />
        <div className="fixed bottom-0 left-0 w-[600px] h-[600px] bg-secondary/20 rounded-full blur-[100px] opacity-20 pointer-events-none translate-y-1/2 -translate-x-1/3" />

        <Navigation />

        <main className="relative pt-32 pb-20 px-6 sm:px-8">
          <div className="mx-auto max-w-7xl">
             <div className="space-y-12">
               {/* Hero / Welcome Area */}
               <Reveal width="100%" delay={0.1}>
                 <div className="flex flex-col gap-2">
                   <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
                     Welcome back
                   </h1>
                   <p className="text-lg text-muted-foreground max-w-2xl">
                     Manage your datasets, visualize insights, and build stunning dashboards.
                   </p>
                 </div>
               </Reveal>

               {/* Main Content */}
               <Reveal width="100%" delay={0.2}>
                 <DatasetList />
               </Reveal>
             </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
