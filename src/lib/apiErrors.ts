import { notifications } from '@mantine/notifications'
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { isApiError } from '@/api/client'

/**
 * Show an API error: field errors go next to their inputs (400/409), anything
 * else becomes a red notification. Returns nothing; use in mutation onError.
 */
export function showApiError<T extends FieldValues>(error: unknown, setError?: UseFormSetError<T>) {
  if (isApiError(error) && error.fieldErrors && setError) {
    let first = true
    for (const [field, message] of Object.entries(error.fieldErrors)) {
      setError(field as Path<T>, { type: 'server', message }, { shouldFocus: first })
      first = false
    }
    return
  }
  notifications.show({
    color: 'red',
    title: 'Could not save',
    message: isApiError(error) ? error.message : 'Something went wrong. Please try again.',
  })
}

export const notifySaved = (message: string) => notifications.show({ color: 'teal', message })
