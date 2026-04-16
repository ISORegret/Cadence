import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import type { BackupPayload } from './backup'
import { SaveExport } from './saveExportPlugin'

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const dataUrl = reader.result as string
      const i = dataUrl.indexOf(',')
      resolve(i >= 0 ? dataUrl.slice(i + 1) : dataUrl)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** JSON, CSV, ICS, etc. — write as UTF-8. PDFs and other binaries use base64. */
function isTextBlob(blob: Blob): boolean {
  const t = blob.type.toLowerCase()
  if (!t) return false
  if (t.startsWith('text/')) return true
  if (t.startsWith('application/json')) return true
  if (t.includes('csv')) return true
  if (t.includes('calendar')) return true
  return false
}

/** Split UTF-8 safely so JNI never receives a chunk that splits a multibyte character. */
function chunkUtf8Bytes(text: string, maxBytes: number): string[] {
  if (text.length === 0) return ['']
  const enc = new TextEncoder()
  const full = enc.encode(text)
  const out: string[] = []
  let byteStart = 0
  const dec = new TextDecoder()
  while (byteStart < full.length) {
    let byteEnd = Math.min(byteStart + maxBytes, full.length)
    while (byteEnd > byteStart && (full[byteEnd] & 0xc0) === 0x80) {
      byteEnd -= 1
    }
    if (byteEnd === byteStart) byteEnd = Math.min(byteStart + maxBytes, full.length)
    out.push(dec.decode(full.subarray(byteStart, byteEnd)))
    byteStart = byteEnd
  }
  return out
}

function mimeForFilename(filename: string): string {
  const f = filename.toLowerCase()
  if (f.endsWith('.json')) return 'application/json'
  if (f.endsWith('.csv')) return 'text/csv'
  if (f.endsWith('.ics')) return 'text/calendar'
  if (f.endsWith('.pdf')) return 'application/pdf'
  return 'application/octet-stream'
}

function isExportCanceled(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '')
  return /canceled|cancelled/i.test(msg)
}

const SINGLE_WRITE_UTF8_BYTES_MAX = 220_000
const MAX_UTF8_BYTES_PER_CHUNK = 2_048
const MS_BETWEEN_APPEND_CHUNKS = 14
/** Smaller UTF-8 chunks over the bridge into SAF (Android). */
const SAF_UTF8_CHUNK_BYTES = 6_144
const SAF_YIELD_MS = 8
const SAF_BASE64_CHARS = 24_576

async function writeUtf8ToCadence(relativePath: string, text: string): Promise<void> {
  await new Promise((r) => setTimeout(r, 32))
  await Filesystem.deleteFile({
    path: relativePath,
    directory: Directory.Data,
  }).catch(() => {})

  const byteLen = new TextEncoder().encode(text).byteLength
  if (byteLen <= SINGLE_WRITE_UTF8_BYTES_MAX) {
    await Filesystem.writeFile({
      path: relativePath,
      data: text,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    })
    return
  }

  const chunks = chunkUtf8Bytes(text, MAX_UTF8_BYTES_PER_CHUNK)
  let i = 0
  for (const chunk of chunks) {
    if (i === 0) {
      await Filesystem.writeFile({
        path: relativePath,
        data: chunk,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
        recursive: true,
      })
    } else {
      await Filesystem.appendFile({
        path: relativePath,
        data: chunk,
        directory: Directory.Data,
        encoding: Encoding.UTF8,
      })
      await new Promise((r) => setTimeout(r, MS_BETWEEN_APPEND_CHUNKS))
    }
    i += 1
  }
}

async function saveUtf8AndroidSaf(filename: string, mimeType: string, text: string): Promise<void> {
  await SaveExport.openSaveLocation({ filename, mimeType })
  try {
    const chunks = chunkUtf8Bytes(text, SAF_UTF8_CHUNK_BYTES)
    for (let i = 0; i < chunks.length; i++) {
      await SaveExport.appendUtf8({ chunk: chunks[i] })
      if (i > 0 && i % 6 === 0) {
        await new Promise((r) => setTimeout(r, SAF_YIELD_MS))
      }
    }
  } catch (e) {
    try {
      await SaveExport.close()
    } catch {
      /* ignore */
    }
    throw e
  }
  await SaveExport.close()
}

async function saveBase64AndroidSaf(filename: string, mimeType: string, base64: string): Promise<void> {
  await SaveExport.openSaveLocation({ filename, mimeType })
  try {
    for (let o = 0; o < base64.length; o += SAF_BASE64_CHARS) {
      await SaveExport.appendBase64({ chunk: base64.slice(o, o + SAF_BASE64_CHARS) })
      if (o > 0 && o % (SAF_BASE64_CHARS * 4) === 0) {
        await new Promise((r) => setTimeout(r, SAF_YIELD_MS))
      }
    }
  } catch (e) {
    try {
      await SaveExport.close()
    } catch {
      /* ignore */
    }
    throw e
  }
  await SaveExport.close()
}

function logNativeExport(title: string, body: string): void {
  if (!Capacitor.isNativePlatform()) return
  const line = `${title}: ${body}`.replace(/\s+/g, ' ').trim()
  console.info(`[Cadence export] ${line}`)
}

async function exportTextNative(filename: string, text: string): Promise<void> {
  const relativePath = `Cadence/${filename}`
  const mime = mimeForFilename(filename)

  if (Capacitor.getPlatform() === 'android') {
    try {
      await saveUtf8AndroidSaf(filename, mime, text)
      logNativeExport(
        'Export complete',
        `Choose Downloads or another folder — then copy the file to your PC (USB, Drive, email).`,
      )
      return
    } catch (e) {
      if (isExportCanceled(e)) {
        logNativeExport('Export canceled', 'No file was saved.')
        throw e
      }
      console.warn('Android SAF export failed, trying app storage', e)
    }
  }

  try {
    await writeUtf8ToCadence(relativePath, text)
    logNativeExport(
      'Export complete',
      `Saved as ${filename} in app storage. For your PC, use Android file backup or export from a desktop browser.`,
    )
  } catch (e) {
    console.error('Filesystem export failed', e)
    const reason =
      e instanceof Error && e.message ? e.message : String(e ?? 'Unknown error')
    logNativeExport(
      'Export failed',
      `${reason.slice(0, 160)}${reason.length > 160 ? '…' : ''} Try a desktop browser export if this keeps happening.`,
    )
    throw e
  }
}

/** JSON backup on device */
export async function exportJsonBackupNative(
  filename: string,
  payload: BackupPayload,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  let text: string
  try {
    text = JSON.stringify(payload)
  } catch (e) {
    console.error('JSON.stringify backup failed', e)
    logNativeExport(
      'Export failed',
      'Could not build the backup file (data may be too large for this device).',
    )
    throw e
  }
  await exportTextNative(filename, text)
}

/** CSV / ICS — same path as JSON */
export async function exportTextFileNative(
  filename: string,
  text: string,
): Promise<void> {
  await new Promise((r) => setTimeout(r, 0))
  await exportTextNative(filename, text)
}

/**
 * Saves a file: on native, text uses SAF (Android) or Filesystem; binary uses base64 + SAF or Filesystem.
 */
export async function downloadBlob(filename: string, blob: Blob): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      if (isTextBlob(blob)) {
        const text = await blob.text()
        await exportTextNative(filename, text)
        return
      }
      await new Promise((r) => setTimeout(r, 20))
      const path = `Cadence/${filename}`
      const data = await blobToBase64(blob)
      const mime = mimeForFilename(filename)

      if (Capacitor.getPlatform() === 'android') {
        try {
          await saveBase64AndroidSaf(filename, mime, data)
          logNativeExport('Saved', `Saved ${filename} where you picked.`)
          return
        } catch (e) {
          if (isExportCanceled(e)) throw e
          console.warn('Android SAF binary save failed, trying app storage', e)
        }
      }

      await Filesystem.deleteFile({
        path,
        directory: Directory.Data,
      }).catch(() => {})
      await Filesystem.writeFile({
        path,
        data,
        directory: Directory.Data,
        recursive: true,
      })
      logNativeExport('Saved', `Saved as ${filename} in app storage.`)
      return
    } catch (e) {
      console.error('Native file save failed', e)
      const reason =
        e instanceof Error ? e.message : String(e ?? 'Unknown error')
      logNativeExport(
        'Could not save',
        `${reason.slice(0, 200)}${reason.length > 200 ? '…' : ''}`,
      )
      throw e
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  a.setAttribute('aria-hidden', 'true')
  a.style.position = 'fixed'
  a.style.left = '-9999px'
  document.body.appendChild(a)
  a.click()
  window.setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 250)
}
