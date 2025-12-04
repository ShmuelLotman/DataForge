import type { BucketType } from '@/lib/types'

/**
 * Format a date string to a human-readable format based on the bucket/granularity
 * @param value - The date string or value to format
 * @param bucket - The time bucket granularity (day, week, month)
 * @returns Formatted date string
 */
export function formatDateLabel(
  value: string | number,
  bucket: BucketType = 'day'
): string {
  if (typeof value !== 'string') return String(value)

  // Try to parse as date
  const date = new Date(value)
  if (isNaN(date.getTime())) return value

  // Format based on bucket/granularity
  const options: Intl.DateTimeFormatOptions = {
    timeZone: 'UTC',
  }

  switch (bucket) {
    case 'month':
      options.month = 'short'
      options.year = 'numeric'
      break
    case 'week':
      options.month = 'short'
      options.day = 'numeric'
      break
    case 'day':
    default:
      options.month = 'short'
      options.day = 'numeric'
      break
  }

  return new Intl.DateTimeFormat('en-US', options).format(date)
}

/**
 * Check if a value looks like an ISO date string
 * @param value - The value to check
 * @returns True if the value appears to be an ISO date string
 */
export function isDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  // Check for ISO date patterns like "2024-01-15" or "2024-01-15T00:00:00"
  return /^\d{4}-\d{2}-\d{2}/.test(value)
}

/**
 * Format a date for display in UI (e.g., cards, lists)
 * @param date - The date to format
 * @returns Formatted date string like "Dec 4, 2024"
 */
export function formatDisplayDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 'Invalid date'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d)
}

/**
 * Format a date with time for timestamps
 * @param date - The date to format
 * @returns Formatted datetime string like "Dec 4, 2024 at 3:45 PM"
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  if (isNaN(d.getTime())) return 'Invalid date'

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

