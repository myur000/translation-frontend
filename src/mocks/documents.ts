import type {
  DocumentContent,
  DocumentItem,
  DocumentPreviewContent,
} from '../types/document.ts'

export const mockDocuments: DocumentItem[] = [
  {
    id: 'course-book',
    name: 'english_course_book.pdf',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    pages: 184,
    status: 'ready',
  },
  {
    id: 'project-report',
    name: 'project_report.docx',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    pages: 32,
    status: 'processing',
    progress: 64,
  },
  {
    id: 'research-notes',
    name: 'research_notes.doc',
    sourceLanguage: 'de',
    targetLanguage: 'ru',
    pages: 18,
    status: 'draft',
  },
]

const courseBookOriginal: DocumentContent = {
  eyebrow: 'UNIT 1 · BEGINNER',
  title: 'English for everyone',
  paragraphs: [
    'This course introduces practical English through short lessons, clear examples, and everyday vocabulary.',
    'Each section combines reading, listening, and speaking exercises. Work through the material at your own pace and return to difficult topics when needed.',
    'The first unit covers greetings, personal information, numbers, and the basic structure of simple sentences.',
  ],
}

const courseBookTranslation: DocumentContent = {
  eyebrow: 'РАЗДЕЛ 1 · НАЧАЛЬНЫЙ УРОВЕНЬ',
  title: 'Английский для каждого',
  paragraphs: [
    'Этот курс знакомит с практическим английским языком через короткие уроки, понятные примеры и повседневную лексику.',
    'Каждый раздел объединяет чтение, аудирование и разговорные упражнения. Изучайте материал в удобном темпе и возвращайтесь к сложным темам при необходимости.',
    'Первый раздел посвящён приветствиям, личной информации, числам и базовой структуре простых предложений.',
  ],
}

const previews: Record<string, DocumentPreviewContent> = {
  'course-book': {
    original: courseBookOriginal,
    translation: courseBookTranslation,
  },
  'project-report': {
    original: {
      eyebrow: 'PROJECT REPORT · Q3',
      title: 'Translation service progress',
      paragraphs: [
        'The team completed the core backend services and prepared a stable document processing pipeline.',
        'The next milestone focuses on the client application, user flows, and integration with the existing REST API.',
        'Risks are tracked separately so that product decisions do not leak into infrastructure code.',
      ],
    },
    translation: {
      eyebrow: 'ОТЧЁТ ПО ПРОЕКТУ · Q3',
      title: 'Прогресс сервиса перевода',
      paragraphs: [
        'Команда завершила основные backend-сервисы и подготовила стабильный процесс обработки документов.',
        'Следующий этап посвящён клиентскому приложению, пользовательским сценариям и интеграции с существующим REST API.',
        'Риски отслеживаются отдельно, чтобы продуктовые решения не смешивались с инфраструктурным кодом.',
      ],
    },
  },
  'research-notes': {
    original: {
      eyebrow: 'FORSCHUNGSNOTIZEN',
      title: 'Dokumentenübersetzung',
      paragraphs: [
        'Die Anwendung soll Dokumente in mehreren Formaten annehmen und den Bearbeitungsstatus verständlich anzeigen.',
        'Eine klare Trennung zwischen Benutzeroberfläche und Serverlogik erleichtert die weitere Entwicklung.',
        'Alle wichtigen Zustände müssen auch ohne endgültiges visuelles Design erkennbar bleiben.',
      ],
    },
    translation: {
      eyebrow: 'ИССЛЕДОВАТЕЛЬСКИЕ ЗАМЕТКИ',
      title: 'Перевод документов',
      paragraphs: [
        'Приложение должно принимать документы нескольких форматов и понятно показывать состояние обработки.',
        'Чёткое разделение интерфейса и серверной логики упрощает дальнейшую разработку.',
        'Все важные состояния должны оставаться понятными даже без финального визуального дизайна.',
      ],
    },
  },
}

export function getMockDocumentPreview(
  document: DocumentItem,
): DocumentPreviewContent {
  return (
    previews[document.id] ?? {
      original: {
        eyebrow: 'ЛОКАЛЬНЫЙ ДОКУМЕНТ',
        title: document.name,
        paragraphs: [
          'Файл добавлен только в интерфейс прототипа и ещё не отправлен на backend.',
          'Настоящее содержимое появится после подключения загрузки и отдельного решения для просмотра документов.',
        ],
      },
      translation: {
        eyebrow: 'ПЕРЕВОД',
        title: 'Здесь появится результат',
        paragraphs: [
          'На этом этапе frontend показывает безопасную заглушку вместо выдуманного результата перевода.',
          'После API-интеграции состояние будет обновляться по реальному статусу задания.',
        ],
      },
    }
  )
}
