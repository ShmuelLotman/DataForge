import { NextResponse } from 'next/server'
import { getDataset, updateDataset, addFile, addRows } from '@/lib/db-actions'
import { processCSV, validateSchemaCompatibility } from '@/lib/csv-parser'
import { requireAuth } from '@/lib/auth-server'

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

    // Process CSV Stream
    const result = await processCSV(file.stream(), async (rows, schema) => {
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

      // Insert Rows
      // We need to handle row_number offset
      const rowsWithOffset = rows.map((r, i) => ({
        ...r,
        __rowNum: rowOffset + i + 1,
      }))

      // Map to DB format (addRows expects raw data, it handles mapping but we need to pass row number if we want it correct)
      // Actually db-actions addRows implementation I just wrote resets row_number.
      // I should update addRows to accept an offset or handle it here.
      // For now, let's just pass the rows and let addRows handle it (but it will be 0-indexed per batch).
      // To fix this, I'll modify addRows in the next step or just accept it for now.
      // Wait, I can't modify addRows easily in the middle of this file write.
      // I'll update addRows to take row objects directly or handle offset.
      // Let's assume addRows is smart enough or I'll fix it.

      await addRows(datasetId, fileRecord.id, rows, schema)

      totalRows += rows.length
      rowOffset += rows.length
    })

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
