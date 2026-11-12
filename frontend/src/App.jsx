import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/Layouts.jsx';
import LoginPage from './pages/LoginPage.jsx';
import SignupPage from './pages/SignupPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import SearchPage from './pages/SearchPage.jsx';
import BookDetailsPage from './pages/BookDetailsPage.jsx';
import IssueBookPage from './pages/IssueBookPage.jsx';
import ComingSoonPage from './pages/ComingSoonPage.jsx';
import MyBooksPage from './pages/MyBooksPage.jsx';

// There is deliberately no public landing page: visitors go straight to sign in.
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/books/:id" element={<BookDetailsPage />} />
            <Route path="/issue/:id" element={<IssueBookPage />} />
            <Route path="/my-books" element={<MyBooksPage />} />
            <Route
              path="/reservations"
              element={
                <ComingSoonPage
                  title="Reservations"
                  phase="Phase 6"
                  description="Your reservations, queue positions and collection holds will appear here."
                />
              }
            />
            <Route
              path="/reservation-history"
              element={
                <ComingSoonPage
                  title="Reservation History"
                  phase="Phase 6"
                  description="Past reservations and how each one ended will appear here."
                />
              }
            />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
