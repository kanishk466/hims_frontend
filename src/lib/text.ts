/** "Dr. Vikram Rao" → "VR" */
export function initials(name: string): string {
  return name
    .replace(/^(dr|mr|mrs|ms|sister)\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}
