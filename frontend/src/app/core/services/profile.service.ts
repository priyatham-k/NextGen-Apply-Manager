import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@environments/environment';
import { ApiResponse, Profile } from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/auth/profile`;

  getFullProfile(): Observable<ApiResponse<Profile>> {
    return this.http.get<ApiResponse<Profile>>(`${this.baseUrl}/full`);
  }

  updateFullProfile(data: Partial<Profile>): Observable<ApiResponse<Profile>> {
    return this.http.patch<ApiResponse<Profile>>(`${this.baseUrl}/full`, data);
  }
}
