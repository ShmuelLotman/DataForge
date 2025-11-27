import type { Dataset, DataFile, DataRow, ColumnSchema } from './types'

// In-memory store for demo purposes
// In production, this would be a database
class DataStore {
  private datasets: Map<string, Dataset> = new Map()
  private files: Map<string, DataFile> = new Map()
  private rows: Map<string, DataRow[]> = new Map()

  constructor() {
    // Initialize with sample data
    this.initializeSampleData()
  }

  private initializeSampleData() {
    const sampleDataset: Dataset = {
      id: 'ds-1',
      name: 'Monthly Sales Report',
      description: 'Sales data across all regions',
      canonicalSchema: [
        { name: 'date', type: 'date', nullable: false },
        { name: 'region', type: 'string', nullable: false },
        { name: 'product', type: 'string', nullable: false },
        { name: 'sales', type: 'number', nullable: false },
        { name: 'units', type: 'number', nullable: false },
      ],
      createdAt: new Date('2024-01-15'),
      updatedAt: new Date('2024-03-20'),
      fileCount: 3,
      rowCount: 450,
    }

    const sampleDataset2: Dataset = {
      id: 'ds-2',
      name: 'Customer Analytics',
      description: 'Customer behavior and engagement metrics',
      canonicalSchema: [
        { name: 'customer_id', type: 'string', nullable: false },
        { name: 'signup_date', type: 'date', nullable: false },
        { name: 'total_purchases', type: 'number', nullable: false },
        { name: 'lifetime_value', type: 'number', nullable: false },
        { name: 'churn_risk', type: 'number', nullable: true },
      ],
      createdAt: new Date('2024-02-01'),
      updatedAt: new Date('2024-03-18'),
      fileCount: 2,
      rowCount: 1250,
    }

    this.datasets.set(sampleDataset.id, sampleDataset)
    this.datasets.set(sampleDataset2.id, sampleDataset2)

    // Sample files
    const sampleFiles: DataFile[] = [
      {
        id: 'f-1',
        datasetId: 'ds-1',
        originalFilename: 'sales_jan_2024.csv',
        displayName: 'January 2024',
        uploadedAt: new Date('2024-01-15'),
        columnSchema: sampleDataset.canonicalSchema!,
        schemaFingerprint: 'abc123',
        rowCount: 150,
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
      },
      {
        id: 'f-2',
        datasetId: 'ds-1',
        originalFilename: 'sales_feb_2024.csv',
        displayName: 'February 2024',
        uploadedAt: new Date('2024-02-15'),
        columnSchema: sampleDataset.canonicalSchema!,
        schemaFingerprint: 'abc123',
        rowCount: 150,
        periodStart: new Date('2024-02-01'),
        periodEnd: new Date('2024-02-29'),
      },
      {
        id: 'f-3',
        datasetId: 'ds-1',
        originalFilename: 'sales_mar_2024.csv',
        displayName: 'March 2024',
        uploadedAt: new Date('2024-03-20'),
        columnSchema: sampleDataset.canonicalSchema!,
        schemaFingerprint: 'abc123',
        rowCount: 150,
        periodStart: new Date('2024-03-01'),
        periodEnd: new Date('2024-03-31'),
      },
    ]

    sampleFiles.forEach((f) => this.files.set(f.id, f))

    // Generate sample rows for visualization
    const regions = ['North', 'South', 'East', 'West']
    const products = ['Widget A', 'Widget B', 'Gadget X', 'Gadget Y']
    const sampleRows: DataRow[] = []

    for (let month = 1; month <= 3; month++) {
      const fileId = `f-${month}`
      for (let i = 0; i < 50; i++) {
        const day = Math.floor(Math.random() * 28) + 1
        sampleRows.push({
          id: `row-${month}-${i}`,
          datasetId: 'ds-1',
          fileId,
          rowNumber: i + 1,
          parsedDate: new Date(2024, month - 1, day),
          data: {
            date: new Date(2024, month - 1, day).toISOString(),
            region: regions[Math.floor(Math.random() * regions.length)],
            product: products[Math.floor(Math.random() * products.length)],
            sales: Math.floor(Math.random() * 10000) + 1000,
            units: Math.floor(Math.random() * 100) + 10,
          },
        })
      }
    }

    this.rows.set('ds-1', sampleRows)
  }

  getDatasets(): Dataset[] {
    return Array.from(this.datasets.values())
  }

  getDataset(id: string): Dataset | undefined {
    return this.datasets.get(id)
  }

  createDataset(
    dataset: Omit<
      Dataset,
      'id' | 'createdAt' | 'updatedAt' | 'fileCount' | 'rowCount'
    >
  ): Dataset {
    const newDataset: Dataset = {
      ...dataset,
      id: `ds-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      fileCount: 0,
      rowCount: 0,
    }
    this.datasets.set(newDataset.id, newDataset)
    return newDataset
  }

  updateDataset(id: string, updates: Partial<Dataset>): Dataset | undefined {
    const dataset = this.datasets.get(id)
    if (!dataset) return undefined

    const updated = { ...dataset, ...updates, updatedAt: new Date() }
    this.datasets.set(id, updated)
    return updated
  }

  deleteDataset(id: string): boolean {
    // Delete associated files and rows
    const filesToDelete = Array.from(this.files.values()).filter(
      (f) => f.datasetId === id
    )
    filesToDelete.forEach((f) => this.files.delete(f.id))
    this.rows.delete(id)
    return this.datasets.delete(id)
  }

  getFilesForDataset(datasetId: string): DataFile[] {
    return Array.from(this.files.values()).filter(
      (f) => f.datasetId === datasetId
    )
  }

  addFile(file: Omit<DataFile, 'id' | 'uploadedAt'>): DataFile {
    const newFile: DataFile = {
      ...file,
      id: `f-${Date.now()}`,
      uploadedAt: new Date(),
    }
    this.files.set(newFile.id, newFile)

    // Update dataset stats
    const dataset = this.datasets.get(file.datasetId)
    if (dataset) {
      dataset.fileCount += 1
      dataset.updatedAt = new Date()
    }

    return newFile
  }

  addRows(
    datasetId: string,
    fileId: string,
    data: Record<string, unknown>[],
    schema: ColumnSchema[]
  ): void {
    const existingRows = this.rows.get(datasetId) || []
    const dateColumn = schema.find((c) => c.type === 'date')?.name

    const newRows: DataRow[] = data.map((row, index) => ({
      id: `row-${fileId}-${index}`,
      datasetId,
      fileId,
      rowNumber: index + 1,
      parsedDate:
        dateColumn && row[dateColumn]
          ? new Date(row[dateColumn] as string)
          : undefined,
      data: row,
    }))

    this.rows.set(datasetId, [...existingRows, ...newRows])

    // Update dataset row count
    const dataset = this.datasets.get(datasetId)
    if (dataset) {
      dataset.rowCount += newRows.length
    }
  }

  getRowsForDataset(datasetId: string, fileIds?: string[]): DataRow[] {
    const rows = this.rows.get(datasetId) || []
    if (fileIds && fileIds.length > 0) {
      return rows.filter((r) => fileIds.includes(r.fileId))
    }
    return rows
  }

  deleteFile(fileId: string): boolean {
    const file = this.files.get(fileId)
    if (!file) return false

    // Remove rows associated with this file
    const datasetRows = this.rows.get(file.datasetId) || []
    this.rows.set(
      file.datasetId,
      datasetRows.filter((r) => r.fileId !== fileId)
    )

    // Update dataset stats
    const dataset = this.datasets.get(file.datasetId)
    if (dataset) {
      dataset.fileCount -= 1
      dataset.rowCount -= file.rowCount
      dataset.updatedAt = new Date()
    }

    return this.files.delete(fileId)
  }
}

export const dataStore = new DataStore()
