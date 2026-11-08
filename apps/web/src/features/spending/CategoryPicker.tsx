import type { CategoryGroupResponse } from '@nestmint/shared';

interface CategoryPickerProps {
  groups: CategoryGroupResponse[];
  value: string;
  onChange: (categoryId: string) => void;
  error?: string | undefined;
}

/** One tap on a chip picks the category. Groups with nothing to pick are left out. */
export function CategoryPicker({ groups, value, onChange, error }: CategoryPickerProps) {
  return (
    <fieldset aria-describedby={error ? 'category-error' : undefined}>
      <legend className="text-sm font-medium text-gray-700">Category</legend>
      <div className="mt-2 flex flex-col gap-3">
        {groups
          .filter((group) => group.categories.length > 0)
          .map((group) => (
            <div key={group.id}>
              <p className="text-xs uppercase tracking-wide text-gray-500">{group.name}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {group.categories.map((category) => (
                  <label
                    key={category.id}
                    className="cursor-pointer rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700 has-checked:bg-emerald-700 has-checked:text-white has-focus-visible:ring-2 has-focus-visible:ring-emerald-500"
                  >
                    <input
                      type="radio"
                      name="category"
                      value={category.id}
                      checked={value === category.id}
                      onChange={() => onChange(category.id)}
                      className="sr-only"
                    />
                    {category.name}
                  </label>
                ))}
              </div>
            </div>
          ))}
      </div>
      {error && (
        <p id="category-error" role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}
