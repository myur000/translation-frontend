import { Route, Routes } from 'react-router'
import { AuthProvider } from './auth/AuthProvider.tsx'
import { ProtectedRoute } from './auth/ProtectedRoute.tsx'
import { AppLayout } from './layouts/AppLayout.tsx'
import { AuthLayout } from './layouts/AuthLayout.tsx'
import { EmailVerificationPage } from './pages/EmailVerificationPage.tsx'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage.tsx'
import { HistoryPage } from './pages/HistoryPage.tsx'
import { LoginPage } from './pages/LoginPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'
import { RegisterPage } from './pages/RegisterPage.tsx'
import { ResetPasswordPage } from './pages/ResetPasswordPage.tsx'
import { SettingsPage } from './pages/SettingsPage.tsx'
import { PlansPage } from './pages/PlansPage.tsx'
import { ProfilePage } from './pages/ProfilePage.tsx'
import { WorkspacePage } from './pages/WorkspacePage.tsx'
import { PreferencesProvider } from './preferences/PreferencesProvider.tsx'

function App() {
  return (
    <PreferencesProvider>
      <AuthProvider>
        <Routes>
          <Route element={<AuthLayout />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/verify-email" element={<EmailVerificationPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<WorkspacePage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/plans" element={<PlansPage />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </PreferencesProvider>
  )
}

export default App
