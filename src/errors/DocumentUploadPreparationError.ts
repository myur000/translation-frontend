export class DocumentUploadPreparationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentUploadPreparationError'
  }
}
