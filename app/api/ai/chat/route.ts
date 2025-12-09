import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai'
import { openai } from '@ai-sdk/openai'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth-server'
import { getDataset } from '@/lib/db-actions'
import { createDatasetTools } from '@/lib/ai/tools'
import { buildSystemPrompt } from '@/lib/ai/prompts'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth()

    const {
      messages,
      datasetId,
      sessionId,
    }: {
      messages: Array<Omit<UIMessage, 'id'>>
      datasetId: string
      sessionId?: string
    } = await req.json()

    // Verify dataset access
    const dataset = await getDataset(datasetId, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    // Get or create chat session
    let chatSessionId = sessionId
    if (!chatSessionId) {
      const { data: newSession, error: sessionError } = await supabase
        .from('ai_chat_sessions')
        .insert({
          user_id: session.user.id,
          dataset_id: datasetId,
          title: null,
        })
        .select('id')
        .single()

      if (sessionError) {
        console.error('Error creating chat session:', sessionError)
        return NextResponse.json(
          { error: 'Failed to create chat session' },
          { status: 500 }
        )
      }

      chatSessionId = newSession?.id
    }

    // Build system prompt (schema only - RAG via tool calls)
    const systemPrompt = buildSystemPrompt(dataset)

    // Create tools for this dataset (includes getDatasetContext for RAG)
    const tools = createDatasetTools(datasetId)

    // Get last user message for session title
    const lastUserMessage = [...messages].reverse().find((m) => {
      const textPart = m.parts?.find((p) => p.type === 'text')
      return textPart && 'text' in textPart
    })

    // Stream response - AI calls tools as needed
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: convertToModelMessages(messages),
      tools,
      stopWhen: stepCountIs(8), // Allow more steps for: getDatasetContext → getMetricStatistics/queryDatasetData → respond
      onError: (error) => {
        console.error('[AI Chat] StreamText error:', error)
      },
      onStepFinish: (event) => {
        console.log(`[AI Chat] Step finished: ${event.finishReason}`)
        if (event.toolCalls && event.toolCalls.length > 0) {
          console.log(
            `[AI Chat] Tool calls:`,
            event.toolCalls.map((tc) => ({
              name: tc.toolName,
              args: 'args' in tc ? tc.args : undefined,
            }))
          )
        }
        if (event.toolResults && event.toolResults.length > 0) {
          console.log(
            `[AI Chat] Tool results:`,
            event.toolResults.map((tr) => {
              const result = 'result' in tr ? tr.result : undefined
              return {
                toolName: tr.toolName,
                success:
                  result &&
                  typeof result === 'object' &&
                  'success' in result
                    ? (result as { success: boolean }).success
                    : 'unknown',
                rowCount:
                  result &&
                  typeof result === 'object' &&
                  'rows' in result &&
                  Array.isArray((result as { rows: unknown[] }).rows)
                    ? (result as { rows: unknown[] }).rows.length
                    : 'N/A',
              }
            })
          )
        }
      },
      onFinish: async ({ text, toolCalls, toolResults }) => {
        if (chatSessionId) {
          // Store user message
          if (lastUserMessage) {
            const textPart = lastUserMessage.parts?.find(
              (p) => p.type === 'text'
            ) as { text: string } | undefined
            const content = textPart?.text || ''
            await supabase.from('ai_chat_messages').insert({
              session_id: chatSessionId,
              role: 'user',
              content,
            })
          }

          // Store assistant response with tool results
          const chartResult = Array.isArray(toolResults)
            ? toolResults.find(
                (r) =>
                  (r.toolName === 'generateChart' ||
                    r.toolName === 'updateChart') &&
                  'result' in r
              )
            : undefined
          const chartConfig =
            chartResult && 'result' in chartResult
              ? (chartResult.result as unknown)
              : undefined

          await supabase.from('ai_chat_messages').insert({
            session_id: chatSessionId,
            role: 'assistant',
            content: text,
            tool_calls: toolCalls,
            chart_config: chartConfig,
          })

          // Set session title from first message
          if (!sessionId && lastUserMessage) {
            const textPart = lastUserMessage.parts?.find(
              (p) => p.type === 'text'
            ) as { text: string } | undefined
            const content = textPart?.text || ''
            await supabase
              .from('ai_chat_sessions')
              .update({ title: content.slice(0, 100) })
              .eq('id', chatSessionId)
          }
        }
      },
    })

    return result.toUIMessageStreamResponse({
      headers: { 'X-Chat-Session-Id': chatSessionId || '' },
    })
  } catch (error) {
    console.error('AI chat error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: 'Failed to process chat request' },
      { status: 500 }
    )
  }
}
