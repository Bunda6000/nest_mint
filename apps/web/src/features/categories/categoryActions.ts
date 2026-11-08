/** What the editing screen can do. Each returns true when it worked, so a form can close itself. */
export interface CategoryActions {
  busy: boolean;
  addGroup: (name: string) => Promise<boolean>;
  addCategory: (groupId: string, name: string) => Promise<boolean>;
  rename: (kind: ItemKind, id: string, name: string) => Promise<boolean>;
  setArchived: (kind: ItemKind, id: string, archived: boolean) => Promise<boolean>;
  moveGroup: (id: string, direction: -1 | 1) => Promise<boolean>;
  moveCategory: (groupId: string, id: string, direction: -1 | 1) => Promise<boolean>;
}

export type ItemKind = 'group' | 'category';
