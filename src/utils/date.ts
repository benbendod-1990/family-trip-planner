import { format, addDays, differenceInCalendarDays, parseISO } from 'date-fns'
import { he } from 'date-fns/locale'

export const formatDateHe = (date: string | Date): string => {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'EEEE, d MMMM yyyy', { locale: he })
  } catch {
    return typeof date === 'string' ? date : ''
  }
}

export const formatDateShort = (date: string | Date): string => {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date
    return format(d, 'd MMM', { locale: he })
  } catch {
    return typeof date === 'string' ? date : ''
  }
}

export const formatDateISO = (date: Date): string => format(date, 'yyyy-MM-dd')

export const getDaysBetween = (start: string, end: string): string[] => {
  const startDate = parseISO(start)
  const endDate = parseISO(end)
  const count = differenceInCalendarDays(endDate, startDate) + 1
  return Array.from({ length: Math.max(1, count) }, (_, i) =>
    formatDateISO(addDays(startDate, i))
  )
}

export const getTripDuration = (start: string, end: string): number => {
  return differenceInCalendarDays(parseISO(end), parseISO(start)) + 1
}
