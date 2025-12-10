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

    // Process CSV Stream with smaller batch size (250) for wide datasets
    // Wide datasets (many columns) cause JSON payload expansion (3-5x CSV size)
    // Smaller batches prevent payload size issues and PostgREST timeouts
    // For 70k rows, this results in ~280 operations, but avoids timeouts
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
            schemaFingerprint: 'pending', // We'll update later or compute incrementally
            rowCount: 0,
          })
        }

        // Insert Rows with proper row_number offset
        await addRows(datasetId, fileRecord.id, rows, schema, rowOffset)

        totalRows += rows.length
        rowOffset += rows.length

        const batchTime = Date.now() - batchStartTime
        if (totalRows % 10000 === 0 || batchTime > 5000) {
          console.log(
            `[Upload] Processed ${totalRows} rows (batch of ${rows.length} took ${batchTime}ms)`
          )
        }
      },
      250
    ) // Reduced batch size to 250 to handle wide datasets (many columns cause JSON expansion)

    const totalTime = Date.now() - startTime
    console.log(
      `[Upload] Completed processing ${result.rowCount} rows in ${totalTime}ms`
    )

    // Generate AI embeddings for the dataset (async, don't block response)
    // This enables RAG-based context retrieval for the AI assistant
    const updatedDataset = await getDataset(datasetId, session.user.id)
    if (updatedDataset) {
      generateDatasetEmbeddings(datasetId, updatedDataset).catch((err) => {
        console.error('[Upload] Error generating embeddings:', err)
      })
    }

    return NextResponse.json({
      success: true,
      file: fileRecord,
      rowCount: result.rowCount,
    })
  } catch (error) {
    console.error('Upload error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}
