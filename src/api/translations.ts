import { apiClient, type AuthenticatedApiCallOptions } from './client.ts'
import type { DocumentStatusResponse } from './contracts/documents.ts'
import { API_ENDPOINTS } from './endpoints.ts'

export interface TranslationDownload {
  blob: Blob
  contentType: string | null
  fileName: string | null
}

function readFileName(contentDisposition: string | null) {
  if (contentDisposition === null) {
    return null
  }

  const encodedMatch = contentDisposition.match(/(?:^|;)\s*filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i)

  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1].trim())
    } catch {
      // Invalid extended names should fall back to the ordinary filename.
    }
  }

  const match = contentDisposition.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"\\])*)"|([^;]+))/i)
  return match?.[1]?.replace(/\\(.)/g, '$1') ?? match?.[2]?.trim() ?? null
}

export function getTranslationStatus(
  jobId: string,
  options: AuthenticatedApiCallOptions,
) {
  return apiClient.request<DocumentStatusResponse>(
    API_ENDPOINTS.documents.status(jobId),
    {
      method: 'GET',
      accessToken: options.accessToken,
      signal: options.signal,
    },
  )
}

export async function downloadTranslation(
  jobId: string,
  options: AuthenticatedApiCallOptions,
): Promise<TranslationDownload> {
  const response = await apiClient.requestBinary(
    API_ENDPOINTS.documents.download(jobId),
    {
      method: 'GET',
      accessToken: options.accessToken,
      signal: options.signal,
    },
  )

  return {
    blob: response.blob,
    contentType: response.contentType,
    fileName: readFileName(response.contentDisposition),
  }
}
