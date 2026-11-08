import {
  fieldErrors,
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type UserResponse,
} from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { ApiError, apiPost } from '../../api/client';
import { TextField } from '../../components/TextField';

type Errors = Record<string, string>;

export function RegisterPage() {
  const [values, setValues] = useState({ email: '', displayName: '', password: '' });
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<UserResponse | null>(null);

  const update = (field: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      setCreated(await apiPost<UserResponse>('/auth/register', parsed.data));
    } catch (error) {
      setErrors(
        error instanceof ApiError
          ? { form: error.message, ...error.details }
          : { form: 'Something went wrong. Please try again.' },
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (created) {
    return (
      <section className="mx-auto max-w-sm p-6" aria-live="polite">
        <h1 className="text-2xl font-semibold">Account created</h1>
        <p className="mt-2 text-gray-600">
          Welcome{created.displayName ? `, ${created.displayName}` : ''}. You can now log in with{' '}
          {created.email}.
        </p>
        <Link
          to="/login"
          className="mt-4 inline-block rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
        >
          Log in
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>
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
          label="Name (optional)"
          autoComplete="name"
          value={values.displayName}
          onChange={update('displayName')}
          error={errors.displayName}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={values.password}
          onChange={update('password')}
          error={errors.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters`}
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-sm text-gray-600">
        Already have an account?{' '}
        <Link to="/login" className="text-emerald-700 underline">
          Log in
        </Link>
      </p>
    </section>
  );
}
