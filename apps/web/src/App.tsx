import { RouterProvider } from 'react-router/dom';
import { AuthProvider } from './features/auth/AuthContext';
import { router } from './router';

export function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
