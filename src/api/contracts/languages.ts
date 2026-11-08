/** Код NLLB-200 (FLORES-200), например `eng_Latn`, `rus_Cyrl`. */
export type NllbLanguageCode = string

export interface LanguageResponse {
  code: NllbLanguageCode
  /** Русское название из каталога бэкенда. */
  name: string
}
