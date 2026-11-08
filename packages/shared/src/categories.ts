export interface CategoryResponse {
  id: string;
  name: string;
}

export interface CategoryGroupResponse {
  id: string;
  name: string;
  categories: CategoryResponse[];
}

/** The logged-in user's categories, grouped and in display order. */
export interface CategoriesResponse {
  groups: CategoryGroupResponse[];
}
