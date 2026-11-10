import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/store/authStore'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import OverviewPage from '@/pages/OverviewPage'
import CoursesPage from '@/pages/CoursesPage'
import AssignmentsPage from '@/pages/AssignmentsPage'
import AssignmentDetailPage from '@/pages/AssignmentDetailPage'
import QuizzesPage from '@/pages/QuizzesPage'
import DocumentsPage from '@/pages/DocumentsPage'
import ActivityPage from '@/pages/ActivityPage'
import IntegrationsPage from '@/pages/IntegrationsPage'
import SettingsPage from '@/pages/SettingsPage'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { ErrorBoundary } from '@/components/ui/ErrorBoundary'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

function AuthGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <Outlet />
}

function GuestGuard() {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner size="lg" />
      </div>
    )
  }
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Outlet />
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              {/* Public routes */}
              <Route element={<GuestGuard />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>

              {/* Protected routes with dashboard layout */}
              <Route element={<AuthGuard />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/dashboard" element={<OverviewPage />} />
                  <Route path="/dashboard/courses" element={<CoursesPage />} />
                  <Route path="/dashboard/assignments" element={<AssignmentsPage />} />
                  <Route path="/dashboard/assignments/:id" element={<AssignmentDetailPage />} />
                  <Route path="/dashboard/quizzes" element={<QuizzesPage />} />
                  <Route path="/dashboard/documents" element={<DocumentsPage />} />
                  <Route path="/dashboard/activity" element={<ActivityPage />} />
                  <Route path="/dashboard/integrations" element={<IntegrationsPage />} />
                  <Route path="/dashboard/settings" element={<SettingsPage />} />
                </Route>
              </Route>

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
