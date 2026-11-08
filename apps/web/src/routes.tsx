import type { RouteObject } from 'react-router';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { HomePage } from './features/home/HomePage';
import { AddExpensePage } from './features/spending/AddExpensePage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: (
      <RequireAuth>
        <HomePage />
      </RequireAuth>
    ),
  },
  {
    path: '/categories',
    element: (
      <RequireAuth>
        <CategoriesPage />
      </RequireAuth>
    ),
  },
  {
    path: '/expenses/new',
    element: (
      <RequireAuth>
        <AddExpensePage />
      </RequireAuth>
    ),
  },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
];
