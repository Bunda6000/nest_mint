import type { CategoriesResponse } from '@nestmint/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/AuthContext';

type Load =
  { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: CategoriesResponse };

export function CategoriesPage() {
  const { authedGet } = useAuth();
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    authedGet<CategoriesResponse>('/categories')
      .then((data) => active && setLoad({ status: 'ready', data }))
      .catch(() => active && setLoad({ status: 'error' }));
    return () => {
      active = false;
    };
  }, [authedGet, attempt]);

  return (
    <section className="mx-auto max-w-md p-6">
      <Link to="/" className="text-sm text-emerald-700 underline">
        ← Back
      </Link>
      <h1 className="mt-3 text-2xl font-semibold">Categories</h1>

      {load.status === 'loading' && (
        <p className="mt-6 text-gray-500" role="status">
          Loading categories…
        </p>
      )}

      {load.status === 'error' && (
        <div role="alert" className="mt-6 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <p>Could not load your categories.</p>
          <button
            type="button"
            onClick={() => {
              setLoad({ status: 'loading' });
              setAttempt((n) => n + 1);
            }}
            className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 hover:bg-red-100"
          >
            Try again
          </button>
        </div>
      )}

      {load.status === 'ready' && (
        <ul className="mt-6 flex flex-col gap-4">
          {load.data.groups.map((group) => (
            <li key={group.id} className="rounded-lg border p-4">
              <h2 className="font-medium">{group.name}</h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {group.categories.map((category) => (
                  <li
                    key={category.id}
                    className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-700"
                  >
                    {category.name}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
