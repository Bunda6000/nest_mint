import type { RouteObject } from 'react-router';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { RequireAuth } from './features/auth/RequireAuth';
import { CategoriesPage } from './features/categories/CategoriesPage';
import { HomePage } from './features/home/HomePage';
import { IncomePage } from './features/income/IncomePage';
import { BillsPage } from './features/obligations/BillsPage';
import { ObligationsPage } from './features/obligations/ObligationsPage';
import { AddExpensePage } from './features/spending/AddExpensePage';
import { TransactionsPage } from './features/spending/TransactionsPage';

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
  {
    path: '/transactions',
    element: (
      <RequireAuth>
        <TransactionsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/income',
    element: (
      <RequireAuth>
        <IncomePage />
      </RequireAuth>
    ),
  },
  {
    path: '/bills',
    element: (
      <RequireAuth>
        <BillsPage />
      </RequireAuth>
    ),
  },
  {
    path: '/obligations',
    element: (
      <RequireAuth>
        <ObligationsPage />
      </RequireAuth>
    ),
  },
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
];
