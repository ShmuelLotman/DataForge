'use client'

import { useRef, useEffect, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Send,
  Sparkles,
  BarChart3,
  RefreshCw,
  Save,
  MessageSquare,
  Loader2,
} from 'lucide-react'
import type { ChartConfig } from '@dataforge/types'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'

interface ChatSidebarProps {
  datasetId: string
  onChartUpdate: (config: ChartConfig) => void
  className?: string
}

const SUGGESTED_PROMPTS = [
  'Show me a summary of this dataset',
  'What are the main metrics I can visualize?',
  'Create a chart showing trends over time',
  'Compare the top categories by value',
]

export function ChatSidebar({
  datasetId,
  onChartUpdate,
  className,
}: ChatSidebarProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [input, setInput] = useState('')

  const { messages, status, error, sendMessage, regenerate } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/ai/chat',
      body: { datasetId, sessionId },
      fetch: async (url, options) => {
        const response = await fetch(url, options)
        // Capture session ID from response header
        const newSessionId = response.headers.get('X-Chat-Session-Id')
        if (newSessionId && !sessionId) {
          setSessionId(newSessionId)
        }
        return response
      },
    }),
    onToolCall: ({ toolCall }) => {
      // Handle chart generation tools
      // Tool call structure: toolCall has toolName and input
      const toolCallWithInput = toolCall as {
        toolName: string
        input?: unknown
      }
      if (toolCallWithInput.toolName === 'generateChart') {
        const input = toolCallWithInput.input
        if (input && typeof input === 'object') {
          onChartUpdate(input as ChartConfig)
        }
      } else if (toolCallWithInput.toolName === 'updateChart') {
        const input = toolCallWithInput.input
        if (input && typeof input === 'object' && 'changes' in input) {
          const { changes } = input as { changes: Partial<ChartConfig> }
          // We need the current config to merge changes - this will be handled by parent
          // For now, just pass the changes
          onChartUpdate(changes as ChartConfig)
        }
      }
    },
  })

  const isLoading = status === 'submitted' || status === 'streaming'

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    // Scroll to bottom when new messages arrive or when loading state changes
    const scrollContainer = scrollRef.current?.querySelector(
      '[data-slot="scroll-area-viewport"]'
    )
    if (scrollContainer) {
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        scrollContainer.scrollTop = scrollContainer.scrollHeight
      })
    }
  }, [messages, isLoading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  const handlePromptClick = (prompt: string) => {
    setInput(prompt)
    inputRef.current?.focus()
  }

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-card/50 backdrop-blur-xl border-l border-border/50',
        className
      )}
      style={{ height: '100%' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border/50 shrink-0">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">AI Assistant</h3>
          <p className="text-xs text-muted-foreground">Ask about your data</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ScrollArea className="h-full p-4" ref={scrollRef}>
          <div className="pb-4">
            <AnimatePresence initial={false}>
              {messages.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="space-y-4"
                >
                  <p className="text-sm text-muted-foreground text-center py-4">
                    I can help you explore and visualize your data. Try asking:
                  </p>
                  <div className="space-y-2">
                    {SUGGESTED_PROMPTS.map((prompt, i) => (
                      <motion.button
                        key={prompt}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => handlePromptClick(prompt)}
                        className="w-full text-left p-3 rounded-xl bg-secondary/30 hover:bg-secondary/50 text-sm transition-colors border border-transparent hover:border-primary/20"
                      >
                        {prompt}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, i) => (
                    <ChatMessage key={message.id} message={message} index={i} />
                  ))}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-2 text-muted-foreground mt-4"
                    >
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Thinking...</span>
                    </motion.div>
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>
        </ScrollArea>
      </div>

      {/* Error State */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mb-2 p-3 rounded-xl bg-destructive/10 border border-destructive/20 shrink-0"
        >
          <p className="text-sm text-destructive">{error.message}</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => regenerate()}
            className="mt-2"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Retry
          </Button>
        </motion.div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-border/50 shrink-0"
      >
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            placeholder="Ask about your data..."
            disabled={isLoading}
            className="flex-1 bg-secondary/30 border-border/50 focus-visible:ring-primary/50"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  )
}

interface ChatMessageProps {
  message: UIMessage
  index: number
}

function ChatMessage({ message, index }: ChatMessageProps) {
  const isUser = message.role === 'user'

  // Extract text content from message parts
  const textParts = message.parts?.filter((p) => p.type === 'text') || []
  const content = textParts
    .map((p) => {
      if (p.type === 'text' && 'text' in p) {
        return p.text
      }
      return ''
    })
    .join('')

  // Check if any text part is still streaming
  const isStreaming = textParts.some(
    (p) => p.type === 'text' && p.state === 'streaming'
  )

  // Extract tool invocations
  const toolInvocations =
    message.parts?.filter(
      (p) => p.type === 'tool-call' || p.type === 'tool-result'
    ) || []

  // Don't render empty messages unless they're user messages or have tool calls
  if (!content && !isUser && toolInvocations.length === 0) {
    return null
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.05 }}
      className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20'
        )}
      >
        {isUser ? (
          <MessageSquare className="h-4 w-4" />
        ) : (
          <Sparkles className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Content */}
      <div
        className={cn(
          'flex-1 min-w-0 space-y-2',
          isUser ? 'text-right' : 'text-left'
        )}
      >
        {(content || isUser) && (
          <div
            className={cn(
              'inline-block p-3 rounded-2xl text-sm max-w-[85%]',
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-sm'
                : 'bg-secondary/50 rounded-tl-sm'
            )}
          >
            <p className="whitespace-pre-wrap">
              {content || (isUser ? '...' : '')}
              {isStreaming && (
                <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse" />
              )}
            </p>
          </div>
        )}

        {/* Tool Results */}
        {toolInvocations.length > 0 && (
          <div className="space-y-2">
            {toolInvocations.map((toolPart, i) => {
              if (toolPart.type === 'tool-call') {
                const toolCall = toolPart as {
                  toolName?: string
                  toolCallId?: string
                  input?: unknown
                }
                return (
                  <ToolResultCard
                    key={`tool-call-${i}-${toolCall.toolCallId || i}`}
                    tool={{
                      toolName:
                        toolCall.toolName || toolCall.toolCallId || 'unknown',
                      args: (toolCall.input as Record<string, unknown>) || {},
                      result: undefined,
                    }}
                  />
                )
              } else if (toolPart.type === 'tool-result') {
                const toolResult = toolPart as {
                  toolName?: string
                  toolCallId?: string
                  output?: unknown
                }
                return (
                  <ToolResultCard
                    key={`tool-result-${i}-${toolResult.toolCallId || i}`}
                    tool={{
                      toolName: toolResult.toolName || 'unknown',
                      args: {},
                      result: toolResult.output,
                    }}
                  />
                )
              }
              return null
            })}
          </div>
        )}
      </div>
    </motion.div>
  )
}

interface ToolResultCardProps {
  tool: {
    toolName: string
    args: Record<string, unknown>
    result?: unknown
  }
}

function ToolResultCard({ tool }: ToolResultCardProps) {
  const icons: Record<string, typeof BarChart3> = {
    generateChart: BarChart3,
    updateChart: RefreshCw,
    saveToDashboard: Save,
    getDatasetContext: MessageSquare,
  }

  const Icon = icons[tool.toolName] || Sparkles

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-accent/10 border border-accent/20 text-sm"
    >
      <Icon className="h-4 w-4 text-accent" />
      <span className="text-muted-foreground">
        {tool.toolName === 'generateChart' && 'Generated chart'}
        {tool.toolName === 'updateChart' && 'Updated chart'}
        {tool.toolName === 'saveToDashboard' && 'Saved to dashboard'}
        {tool.toolName === 'getDatasetContext' && 'Searched dataset'}
      </span>
    </motion.div>
  )
}
