import { fieldErrors, loginSchema } from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { ApiError } from '../../api/client';
import { TextField } from '../../components/TextField';
import { useAuth } from './AuthContext';

type Errors = Record<string, string>;

export function LoginPage() {
  const { state, login } = useAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  if (state.status === 'authenticated') return <Navigate to="/" replace />;

  const update = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data);
    } catch (error) {
      setErrors({
        form: error instanceof ApiError ? error.message : 'Something went wrong. Please try again.',
      });
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Log in</h1>
      <form className="mt-6 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
        {errors.form && (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {errors.form}
          </p>
        )}
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update('email')}
          error={errors.email}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-sm">
        <Link to="/forgot-password" className="text-emerald-700 underline">
          Forgot your password?
        </Link>
      </p>
      <p className="mt-6 text-sm text-gray-600">
        No account yet?{' '}
        <Link to="/register" className="text-emerald-700 underline">
          Create one
        </Link>
      </p>
    </section>
  );
}
