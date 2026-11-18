import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { QueryProvider } from './query/QueryProvider.tsx'
import { ProtectedRoute } from './auth/ProtectedRoute.tsx'
import { AppLayout } from './layouts/AppLayout.tsx'
import { AuthLayout } from './layouts/AuthLayout.tsx'
import { EmailChangeLinkPage } from './pages/EmailChangeLinkPage.tsx'
import { EmailVerificationPage } from './pages/EmailVerificationPage.tsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { HomePage } from './pages/HomePage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { PlansPage } from './pages/PlansPage.tsx'
import { WorkspacePage } from './pages/WorkspacePage.tsx'
import { PreferencesProvider } from './preferences/PreferencesProvider.tsx'

// Раздел заметок со своим парсером Markdown грузится при первом открытии,
// а не вместе с основным кодом: большинство сессий начинается с книг.
const NotesPage = lazy(() => import('./pages/NotesPage.tsx').then((module) => ({ default: module.NotesPage })))
// Граф с холстом и раскладкой нужен только в своём разделе — отдельный кусок кода.
const GraphPage = lazy(() => import('./pages/GraphPage.tsx').then((module) => ({ default: module.GraphPage })))
// Профиль с разделами безопасности открывают редко — отдельный кусок кода.
const ProfilePage = lazy(() => import('./pages/ProfilePage.tsx').then((module) => ({ default: module.ProfilePage })))
const GlossaryPage = lazy(() => import('./pages/GlossaryPage.tsx').then((module) => ({ default: module.GlossaryPage })))

function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <QueryProvider>
          <Routes>
            <Route element={<AuthLayout />}>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/verify-email" element={<EmailVerificationPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/confirm-email-change" element={<EmailChangeLinkPage action="confirm" />} />
              <Route path="/cancel-email-change" element={<EmailChangeLinkPage action="cancel" />} />
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/documents/:jobId" element={<WorkspacePage />} />
                <Route path="/drafts/:draftId" element={<WorkspacePage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/notes" element={<Suspense><NotesPage /></Suspense>} />
                <Route path="/notes/new" element={<Suspense><NotesPage isNew /></Suspense>} />
                <Route path="/notes/:noteId" element={<Suspense><NotesPage /></Suspense>} />
                <Route path="/graph" element={<Suspense><GraphPage /></Suspense>} />
                <Route path="/glossary" element={<Suspense><GlossaryPage /></Suspense>} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/plans" element={<PlansPage />} />
                <Route path="/profile" element={<Suspense><ProfilePage /></Suspense>} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </QueryProvider>
      </AuthProvider>
    </PreferencesProvider>
  )
}

export default App
