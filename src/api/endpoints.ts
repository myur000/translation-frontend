export const API_ENDPOINTS = {
  auth: {
    register: '/auth/register',
    login: '/auth/login',
    refresh: '/auth/refresh',
    logout: '/auth/logout',
    logoutAll: '/auth/logout-all',
    requestEmailVerification: '/auth/email-verification/request',
    confirmEmailVerification: '/auth/email-verification/confirm',
    requestPasswordReset: '/auth/password-reset/request',
    confirmPasswordReset: '/auth/password-reset/confirm',
    loginSecondFactor: '/auth/login/second-factor',
  },
  accountSecurity: {
    password: '/account/password',
    emailChange: '/account/email-change',
    confirmEmailChange: '/account/email-change/confirm',
    cancelEmailChange: '/account/email-change/cancel',
    sessions: '/account/sessions',
    session: (sessionId: string) => `/account/sessions/${encodeURIComponent(sessionId)}`,
    secondFactor: '/account/second-factor',
    secondFactorSetup: '/account/second-factor/setup',
    secondFactorEnable: '/account/second-factor/enable',
    secondFactorDisable: '/account/second-factor/disable',
    recoveryCodes: '/account/second-factor/recovery-codes',
  },
  languages: '/languages',
  documents: {
    upload: '/documents/upload',
    status: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/status`,
    download: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/download`,
    history: '/documents/history',
    estimate: '/documents/estimate',
    events: '/documents/events',
    document: (jobId: string) => `/documents/${encodeURIComponent(jobId)}`,
    translations: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/translations`,
    feedback: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/feedback`,
    cancel: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/cancel`,
    text: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/text`,
  },
  notes: {
    list: '/notes',
    graph: '/notes/graph',
    note: (noteId: string) => `/notes/${encodeURIComponent(noteId)}`,
    backlinks: (noteId: string) =>
      `/notes/${encodeURIComponent(noteId)}/backlinks`,
    quotes: (noteId: string) =>
      `/notes/${encodeURIComponent(noteId)}/quotes`,
    quote: (noteId: string, quoteId: string) =>
      `/notes/${encodeURIComponent(noteId)}/quotes/${encodeURIComponent(quoteId)}`,
    documents: (noteId: string) =>
      `/notes/${encodeURIComponent(noteId)}/documents`,
    document: (noteId: string, jobId: string) =>
      `/notes/${encodeURIComponent(noteId)}/documents/${encodeURIComponent(jobId)}`,
  },
  terms: {
    list: '/terms',
    term: (termId: string) => `/terms/${encodeURIComponent(termId)}`,
    documents: (termId: string) => `/terms/${encodeURIComponent(termId)}/documents`,
  },
  profile: {
    details: '/profile',
    avatar: '/profile/avatar',
  },
  account: {
    usage: '/account/usage',
    subscription: '/account/subscription',
    cancelSubscription: '/account/subscription/cancellation',
    notifications: '/account/notifications',
  },
  subscriptionOffers: '/subscription-offers',
  subscriptionPurchases: '/subscription-purchases',
} as const
