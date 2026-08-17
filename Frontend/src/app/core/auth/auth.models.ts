export interface AuthUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
