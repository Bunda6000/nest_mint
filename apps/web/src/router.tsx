import { createBrowserRouter } from 'react-router';
import { RegisterPage } from './features/auth/RegisterPage';
import { HomePage } from './features/home/HomePage';

export const router = createBrowserRouter([
  { path: '/', element: <HomePage /> },
  { path: '/register', element: <RegisterPage /> },
]);
