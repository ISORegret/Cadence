/** Minimal RFC4180-style CSV parser (handles quoted fields and doubled quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cur = ''
  let i = 0
  let inQuotes = false
  const len = text.length

  while (i < len) {
    const c = text[i]!
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"'
        i += 2
        continue
      }
      if (c === '"') {
        inQuotes = false
        i++
        continue
      }
      cur += c
      i++
      continue
    }
    if (c === '"') {
      inQuotes = true
      i++
      continue
    }
    if (c === ',') {
      row.push(cur)
      cur = ''
      i++
      continue
    }
    if (c === '\r') {
      i++
      continue
    }
    if (c === '\n') {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
      i++
      continue
    }
    cur += c
    i++
  }
  row.push(cur)
  rows.push(row)

  while (rows.length > 0 && rows[rows.length - 1]!.every((cell) => cell.trim() === '')) {
    rows.pop()
  }
  return rows
}
