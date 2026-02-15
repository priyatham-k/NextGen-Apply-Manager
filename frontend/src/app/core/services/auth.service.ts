import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, BehaviorSubject } from 'rxjs';
import { environment } from '@environments/environment';
import { User, ApiResponse } from '@models/index';

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData extends LoginCredentials {
  firstName: string;
  middleName?: string;
  lastName: string;
}

interface AuthResponse {
  user: User;
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  
  // Using signals for reactive state
  private currentUserSignal = signal<User | null>(null);
  private tokenSignal = signal<string | null>(null);
  
  // Computed signals
  isAuthenticated = computed(() => !!this.currentUserSignal() && !!this.tokenSignal());
  currentUser = this.currentUserSignal.asReadonly();
  
  constructor() {
    this.loadFromStorage();
  }
  
  private loadFromStorage(): void {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('current_user');
    
    if (token && userStr) {
      this.tokenSignal.set(token);
      this.currentUserSignal.set(JSON.parse(userStr));
    }
  }
  
  login(credentials: LoginCredentials): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(
      `${environment.apiUrl}/auth/login`,
      credentials
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.setAuth(response.data);
        }
      })
    );
  }
  
  register(data: RegisterData): Observable<ApiResponse<AuthResponse>> {
    return this.http.post<ApiResponse<AuthResponse>>(
      `${environment.apiUrl}/auth/register`,
      data
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.setAuth(response.data);
        }
      })
    );
  }
  
  logout(): void {
    this.currentUserSignal.set(null);
    this.tokenSignal.set(null);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('current_user');
    this.router.navigate(['/auth/login']);
  }
  
  getToken(): string | null {
    return this.tokenSignal();
  }
  
  private setAuth(authData: AuthResponse): void {
    this.tokenSignal.set(authData.token);
    this.currentUserSignal.set(authData.user);
    localStorage.setItem('auth_token', authData.token);
    localStorage.setItem('current_user', JSON.stringify(authData.user));
  }
  
  refreshToken(): Observable<ApiResponse<{ token: string }>> {
    return this.http.post<ApiResponse<{ token: string }>>(
      `${environment.apiUrl}/auth/refresh`,
      {}
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.tokenSignal.set(response.data.token);
          localStorage.setItem('auth_token', response.data.token);
        }
      })
    );
  }
  
  updateProfile(updates: Partial<User>): Observable<ApiResponse<User>> {
    return this.http.patch<ApiResponse<User>>(
      `${environment.apiUrl}/auth/profile`,
      updates
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
          localStorage.setItem('current_user', JSON.stringify(response.data));
        }
      })
    );
  }

  uploadProfilePicture(file: File): Observable<ApiResponse<User>> {
    const formData = new FormData();
    formData.append('picture', file);

    return this.http.post<ApiResponse<User>>(
      `${environment.apiUrl}/auth/profile/picture`,
      formData
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
          localStorage.setItem('current_user', JSON.stringify(response.data));
        }
      })
    );
  }

  removeProfilePicture(): Observable<ApiResponse<User>> {
    return this.http.delete<ApiResponse<User>>(
      `${environment.apiUrl}/auth/profile/picture`
    ).pipe(
      tap(response => {
        if (response.success && response.data) {
          this.currentUserSignal.set(response.data);
          localStorage.setItem('current_user', JSON.stringify(response.data));
        }
      })
    );
  }
}
