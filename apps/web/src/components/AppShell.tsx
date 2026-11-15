import { type ReactNode, useState } from 'react';
import { NavLink } from 'react-router';
import { useAuth } from '../features/auth/AuthContext';
import { LanguageSwitch } from '../i18n/LanguageSwitch';
import { type MessageKey } from '../i18n/messages';
import { useT } from '../i18n/translate';

const LINKS: { to: string; label: MessageKey; end?: boolean }[] = [
  { to: '/', label: 'nav.home', end: true },
  { to: '/transactions', label: 'nav.expenses' },
  { to: '/income', label: 'nav.income' },
  { to: '/bills', label: 'nav.bills' },
  { to: '/budget', label: 'nav.budget' },
  { to: '/forecast', label: 'nav.forecast' },
  { to: '/goals', label: 'nav.goals' },
  { to: '/categories', label: 'nav.categories' },
  { to: '/import', label: 'nav.import' },
  { to: '/settings', label: 'nav.settings' },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 text-sm ${
    isActive ? 'bg-emerald-50 font-medium text-emerald-800' : 'text-gray-700 hover:bg-gray-100'
  }`;

/**
 * The frame of every logged-in screen. Phones: a top bar with a menu button. Desktop (lg and up):
 * a fixed side menu, so every screen is one click away and the content gets the rest of the width.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { state, logout } = useAuth();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const name = state.status === 'authenticated' ? (state.user.displayName ?? state.user.email) : '';

  return (
    <div className="min-h-screen bg-gray-50/40">
      <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-white px-4 py-3 lg:hidden">
        <span className="text-lg font-semibold">NestMint</span>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="main-menu"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        >
          {t(open ? 'nav.closeMenu' : 'nav.menu')}
        </button>
      </header>

      <aside
        id="main-menu"
        className={`${open ? 'block' : 'hidden'} border-b bg-white px-4 py-3 lg:fixed lg:inset-y-0 lg:left-0 lg:z-10 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-b-0 lg:px-4 lg:py-6`}
      >
        <p className="hidden px-3 text-xl font-semibold lg:block">NestMint</p>
        <nav aria-label={t('nav.main')} className="mt-1 flex flex-col gap-1 lg:mt-6">
          {LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={linkClass}
              onClick={() => setOpen(false)}
            >
              {t(link.label)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-3 border-t pt-4 lg:mt-auto">
          <p className="truncate px-3 text-xs text-gray-500">{name}</p>
          <div className="flex items-center justify-between gap-2 px-3">
            <button
              type="button"
              onClick={() => void logout()}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              {t('common.logOut')}
            </button>
            <LanguageSwitch />
          </div>
        </div>
      </aside>

      <main className="lg:pl-60">{children}</main>
    </div>
  );
}
