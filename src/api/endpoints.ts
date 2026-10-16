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
  },
  documents: {
    upload: '/documents/upload',
    status: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/status`,
    download: (jobId: string) =>
      `/documents/${encodeURIComponent(jobId)}/download`,
    history: '/documents/history',
  },
  profile: {
    details: '/profile',
    avatar: '/profile/avatar',
  },
  account: {
    usage: '/account/usage',
    subscription: '/account/subscription',
    cancelSubscription: '/account/subscription/cancellation',
  },
  subscriptionOffers: '/subscription-offers',
  subscriptionPurchases: '/subscription-purchases',
} as const
