/** NLLB-200 (FLORES-200) code such as `eng_Latn`, `rus_Cyrl`. */
export type NllbLanguageCode = string

export interface LanguageResponse {
  code: NllbLanguageCode
  /** Russian display name from the backend catalog. */
  name: string
}
