export type UUID = string
export type ISO8601DateTime = string

export interface ApiError {
  timestamp: ISO8601DateTime
  status: number
  message: string
  path: string
  fieldErrors: Record<string, string>
  correlation_id: string
}

export type ApiErrorStatus =
  | 400
  | 401
  | 403
  | 404
  | 409
  | 410
  | 413
  | 415
  | 429
  | 500
  | 503
