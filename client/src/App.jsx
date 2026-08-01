import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import AdminCatalog from './pages/AdminCatalog';
import AdminCourseDetail from './pages/AdminCourseDetail';
import EnrollCourses from './pages/EnrollCourses';
import OnboardingAssessment from './pages/OnboardingAssessment';
import AcceptInvite from './pages/AcceptInvite';

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
          <Navbar />
          <main className="flex-grow">
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />

              {/* Protected Learner Routes */}
              <Route
                path="/dashboard"
                element={
                  <ProtectedRoute allowedRoles={['Learner']}>
                    <Dashboard />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses"
                element={
                  <ProtectedRoute allowedRoles={['Learner']}>
                    <EnrollCourses />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/courses/:id/assessment"
                element={
                  <ProtectedRoute allowedRoles={['Learner']}>
                    <OnboardingAssessment />
                  </ProtectedRoute>
                }
              />

              {/* Protected Admin Routes */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute allowedRoles={['Admin']}>
                    <AdminCatalog />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/courses/:courseId"
                element={
                  <ProtectedRoute allowedRoles={['Admin']}>
                    <AdminCourseDetail />
                  </ProtectedRoute>
                }
              />

              {/* Fallback Redirects */}
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;
