import { fieldErrors, passwordResetRequestSchema } from '@nestmint/shared';
import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { apiPost, ApiError } from '../../api/client';
import { TextField } from '../../components/TextField';
import { useT } from '../../i18n/translate';

/** NM-40: asks for a reset link. The answer is the same whether or not the email has an account. */
export function ForgotPasswordPage() {
  const { t } = useT();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = passwordResetRequestSchema.safeParse({ email });
    if (!parsed.success) return setError(fieldErrors(parsed.error).email);
    setError(undefined);
    try {
      await apiPost('/auth/password-reset/request', parsed.data);
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('auth.somethingWrong'));
    }
  }

  return (
    <section className="mx-auto max-w-sm p-6">
      <h1 className="text-2xl font-semibold">{t('auth.forgotTitle')}</h1>
      {sent ? (
        <p className="mt-6 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          {t('auth.linkSent')}
        </p>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={submit} noValidate>
          <TextField
            label={t('auth.email')}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error}
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            {t('auth.sendLink')}
          </button>
        </form>
      )}
      <p className="mt-6 text-sm">
        <Link to="/login" className="text-emerald-700 underline">
          {t('auth.backToLogin')}
        </Link>
      </p>
    </section>
  );
}
