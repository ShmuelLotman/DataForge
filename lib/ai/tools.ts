import { tool, zodSchema } from 'ai'
import { z } from 'zod'
import { findRelevantContext } from './rag'
import type { ChartConfig } from '@dataforge/types'

/**
 * Create AI tools for a specific dataset
 */
export function createDatasetTools(datasetId: string) {
  return {
    /**
     * Search dataset context for relevant information
     */
    getDatasetContext: tool({
      description:
        'Search the dataset for relevant context to answer questions about the data structure, values, or statistics. Use this before generating charts to understand what columns and data are available.',
      inputSchema: zodSchema(
        z.object({
          query: z
            .string()
            .describe('What information to search for in the dataset'),
        })
      ),
      execute: async ({ query }) => {
        const context = await findRelevantContext(datasetId, query)
        if (context.length === 0) {
          return { found: false, message: 'No relevant context found' }
        }
        return {
          found: true,
          context: context.map((c) => ({
            type: c.contentType,
            content: c.content,
            relevance: Math.round(c.similarity * 100) + '%',
          })),
        }
      },
    }),

    /**
     * Generate a chart configuration
     */
    generateChart: tool({
      description:
        'Generate a chart visualization based on user request. Always call getDatasetContext first to understand available columns.',
      inputSchema: zodSchema(
        z.object({
          chartType: z
            .enum(['line', 'bar', 'area', 'pie', 'scatter'])
            .describe('Type of chart to generate'),
          xAxis: z.string().describe('Column name for x-axis'),
          yAxis: z
            .array(z.string())
            .min(1)
            .describe('Column name(s) for y-axis metrics'),
          groupBy: z
            .string()
            .nullable()
            .optional()
            .describe('Optional column to group/color by'),
          bucket: z
            .enum(['day', 'week', 'month'])
            .nullable()
            .optional()
            .describe('Time bucket for date x-axis'),
          dateRange: z
            .object({
              start: z.string().describe('Start date YYYY-MM-DD'),
              end: z.string().describe('End date YYYY-MM-DD'),
            })
            .nullable()
            .optional()
            .describe('Date range filter'),
          aggregation: z
            .enum(['sum', 'avg', 'count', 'min', 'max'])
            .optional()
            .default('sum')
            .describe('Aggregation function for metrics'),
          title: z.string().optional().describe('Optional chart title'),
        })
      ),
      execute: async (config): Promise<ChartConfig & { title?: string }> => {
        // Return the config directly - client will render it
        return {
          chartType: config.chartType,
          xAxis: config.xAxis,
          yAxis: config.yAxis,
          groupBy: config.groupBy ?? null,
          bucket: config.bucket ?? null,
          dateRange: config.dateRange
            ? {
                start: config.dateRange.start,
                end: config.dateRange.end,
              }
            : null,
          aggregation: config.aggregation,
          title: config.title,
        }
      },
    }),

    /**
     * Update an existing chart
     */
    updateChart: tool({
      description:
        'Modify the current chart configuration. Use this when the user wants to change chart type, add/remove metrics, change grouping, etc.',
      inputSchema: zodSchema(
        z.object({
          changes: z.object({
            chartType: z
              .enum(['line', 'bar', 'area', 'pie', 'scatter'])
              .optional(),
            xAxis: z.string().optional(),
            yAxis: z.array(z.string()).optional(),
            groupBy: z.string().nullable().optional(),
            bucket: z.enum(['day', 'week', 'month']).nullable().optional(),
            dateRange: z
              .object({
                start: z.string(),
                end: z.string(),
              })
              .nullable()
              .optional(),
            aggregation: z
              .enum(['sum', 'avg', 'count', 'min', 'max'])
              .optional(),
          }),
          explanation: z.string().describe('Brief explanation of what changed'),
        })
      ),
      execute: async ({ changes, explanation }) => {
        return { changes, explanation, action: 'update' }
      },
    }),

    /**
     * Save current chart to a dashboard
     */
    saveToDashboard: tool({
      description:
        'Save the current chart to a dashboard. Ask the user which dashboard or if they want to create a new one.',
      inputSchema: zodSchema(
        z.object({
          dashboardId: z
            .string()
            .optional()
            .describe('Existing dashboard ID, or omit to create new'),
          dashboardName: z
            .string()
            .optional()
            .describe('Name for new dashboard'),
          panelTitle: z.string().describe('Title for this chart panel'),
        })
      ),
      execute: async (params) => {
        return { action: 'saveToDashboard', ...params }
      },
    }),
  }
}

export type DatasetTools = ReturnType<typeof createDatasetTools>
