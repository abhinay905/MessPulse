/**
 * app/router.tsx — Application routing configuration.
 * DOC3 §3.3.
 */

import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from '../features/auth/LoginPage';
import { StudentPage } from '../features/student/StudentPage';
import { CheckInPage } from '../features/student/CheckInPage';
import { StaffPage } from '../features/staff/StaffPage';
import { AdminPage } from '../features/admin/AdminPage';
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
    path: '/student/checkin',
    element: (
      <ProtectedRoute allowedRoles={['student', 'staff', 'admin']}>
        <CheckInPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/staff',
    element: (
      <ProtectedRoute allowedRoles={['staff', 'admin']}>
        <StaffPage />
      </ProtectedRoute>
    ),
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute allowedRoles={['admin']}>
        <AdminPage />
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
