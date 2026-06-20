import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, tap } from 'rxjs';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  onlineStatus?: boolean;
  lastSeen?: string;
}

export interface AuthResponse {
  message: string;
  token: string;
  user: AuthUser;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly apiUrl = 'http://localhost:3000/api/auth';

  constructor(private http: HttpClient) {}

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/register`, {
        username,
        email,
        password,
      })
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.apiUrl}/login`, {
        email,
        password,
      })
      .pipe(map((response) => this.normalizeAuthResponse(response)));
  }

  getCurrentUser(): Observable<AuthUser> {
    return this.http.get<{ user: unknown }>(`${this.apiUrl}/me`).pipe(
      map((response) => this.normalizeUser(response.user)),
      tap((user) => {
        localStorage.setItem('user', JSON.stringify(user));
      }),
    );
  }

  saveAuthData(response: AuthResponse): void {
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(this.normalizeUser(response.user)));
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUser(): AuthUser | null {
    const user = localStorage.getItem('user');

    if (!user) {
      return null;
    }

    return this.normalizeUser(JSON.parse(user));
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  private normalizeAuthResponse(response: AuthResponse): AuthResponse {
    return {
      ...response,
      user: this.normalizeUser(response.user),
    };
  }

  private normalizeUser(user: unknown): AuthUser {
    const value = user as Record<string, unknown>;

    return {
      id: String(value['id'] ?? value['_id'] ?? ''),
      username: String(value['username'] ?? ''),
      email: String(value['email'] ?? ''),
      avatar: typeof value['avatar'] === 'string' ? value['avatar'] : '',
      onlineStatus: Boolean(value['onlineStatus']),
      lastSeen: typeof value['lastSeen'] === 'string' ? value['lastSeen'] : undefined,
    };
  }
}
