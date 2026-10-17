/**
 * app/router.tsx — Application routing configuration.
 * DOC3 §3.3.
 */

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { StudentPage } from '../features/student/StudentPage';
import { ProtectedRoute } from './ProtectedRoute';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/student',
    element: (
      <ProtectedRoute allowedRoles={['student', 'staff', 'admin']}>
        <StudentPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/',
    element: <Navigate to="/student" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/student" replace />,
  },
]);
