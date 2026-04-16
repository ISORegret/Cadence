import { registerPlugin } from '@capacitor/core'

export interface SaveExportPlugin {
  openSaveLocation(options: { filename: string; mimeType?: string }): Promise<{ ok: boolean }>
  appendUtf8(options: { chunk: string }): Promise<void>
  appendBase64(options: { chunk: string }): Promise<void>
  close(): Promise<void>
}

export const SaveExport = registerPlugin<SaveExportPlugin>('SaveExport')
