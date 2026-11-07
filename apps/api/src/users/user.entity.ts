export interface User {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
}

export interface NewUser {
  email: string;
  passwordHash: string;
  displayName?: string;
}
