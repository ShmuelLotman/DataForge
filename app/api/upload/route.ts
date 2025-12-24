import { NextResponse } from 'next/server'
import { getDataset, updateDataset, addFile, addRows } from '@/lib/db-actions'
import { processCSV, validateSchemaCompatibility } from '@/lib/csv-parser'
import { requireAuth } from '@/lib/auth-server'
import { generateDatasetEmbeddings } from '@/lib/ai/embeddings'

// Increase timeout for large file uploads (up to 5 minutes)
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const session = await requireAuth()
    const formData = await request.formData()
    const datasetId = formData.get('datasetId') as string
    const file = formData.get('file') as File

    if (!datasetId || !file) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const dataset = await getDataset(datasetId, session.user.id)
    if (!dataset) {
      return NextResponse.json({ error: 'Dataset not found' }, { status: 404 })
    }

    let fileRecord: any = null
    let totalRows = 0
    let rowOffset = 0
    let finalSchema = dataset.canonicalSchema
    const startTime = Date.now()

    // Use a moderate batch size for CSV parsing - the actual DB insert
    // chunking is handled dynamically in addRows based on column count
    const CSV_PARSE_BATCH_SIZE = 500

    const result = await processCSV(
      file.stream(),
      async (rows, schema) => {
        const batchStartTime = Date.now()
        
        // Initialize on first batch
        if (!fileRecord) {
          // Validate Schema
          if (dataset.canonicalSchema) {
            const validation = validateSchemaCompatibility(
              schema,
              dataset.canonicalSchema
            )
            if (!validation.compatible) {
              throw new Error(
                `Schema mismatch: ${validation.differences.join(', ')}`
              )
            }
          } else {
            // Set canonical schema
            await updateDataset(
              datasetId,
              { canonicalSchema: schema },
              session.user.id
            )
            finalSchema = schema
          }

          // Create File Record
          fileRecord = await addFile({
            datasetId,
            originalFilename: file.name,
            displayName: file.name.replace(/\.csv$/i, ''),
            columnSchema: schema,
            schemaFingerprint: 'pending',
            rowCount: 0,
          })
        }

        // Insert Rows - addRows handles chunking and retries internally
        await addRows(datasetId, fileRecord.id, rows, schema, rowOffset)

        totalRows += rows.length
        rowOffset += rows.length
      },
      CSV_PARSE_BATCH_SIZE
    )

    // Generate AI embeddings for the dataset (async, don't block response)
    // This enables RAG-based context retrieval for the AI assistant
    const updatedDataset = await getDataset(datasetId, session.user.id)
    if (updatedDataset) {
      generateDatasetEmbeddings(datasetId, updatedDataset).catch(() => {
        // Silently handle embedding generation errors
      })
    }

    return NextResponse.json({
      success: true,
      file: fileRecord,
      rowCount: result.rowCount,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
