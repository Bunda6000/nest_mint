import { fieldErrors, passwordResetConfirmSchema } from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { apiPost, ApiError } from '../../api/client';
import { TextField } from '../../components/TextField';

/** NM-40: the page the emailed link opens. All sessions end once the password is changed. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = passwordResetConfirmSchema.safeParse({ token, password });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    try {
      await apiPost('/auth/password-reset/confirm', parsed.data);
      setDone(true);
    } catch (e) {
      setErrors({
        form: e instanceof ApiError ? e.message : 'Something went wrong. Please try again.',
      });
    }
  }

  return (
    <section className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold">Choose a new password</h1>
      {done ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          Your password is changed and you are logged out everywhere.{' '}
          <Link to="/login" className="underline">
            Log in
          </Link>
        </p>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
          {(errors.form ?? errors.token) && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {errors.form ?? errors.token}{' '}
              <Link to="/forgot-password" className="underline">
                Ask for a new link
              </Link>
            </p>
          )}
          <TextField
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            Change password
          </button>
        </form>
      )}
    </section>
  );
}
