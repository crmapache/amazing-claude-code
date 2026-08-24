/**
 * When something last happened, in words short enough for a list.
 *
 * Recent things are labelled by time and older ones by date: that is what makes a conversation from
 * this morning easy to pick out from one three weeks old. Shared by the panel's history and the
 * phone's, because two lists of the same conversations that word their dates differently is the sort
 * of small inconsistency that makes an application feel assembled rather than made.
 */
export const describeWhen = (at: number): string => {
  const date = new Date(at)
  const sameDay = new Date().toDateString() === date.toDateString()

  return sameDay
    ? `today ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
    : date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
