import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, finalize } from 'rxjs';
import { environment } from '@environments/environment';
import { DashboardStats, ApiResponse, AnalyticsInsight, AnalyticsInsightsResponse } from '@models/index';

@Injectable({
  providedIn: 'root'
})
export class AnalyticsService {
  private http = inject(HttpClient);

  private dashboardStatsSignal = signal<DashboardStats | null>(null);
  private loadingSignal = signal(false);
  private insightsSignal = signal<AnalyticsInsight[]>([]);
  private insightsLoadingSignal = signal(false);

  stats = this.dashboardStatsSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();
  insights = this.insightsSignal.asReadonly();
  insightsLoading = this.insightsLoadingSignal.asReadonly();

  loadDashboard(): Observable<ApiResponse<DashboardStats>> {
    this.loadingSignal.set(true);
    return this.http.get<ApiResponse<DashboardStats>>(
      `${environment.apiUrl}/analytics/dashboard`
    ).pipe(
      tap(res => {
        if (res.data) {
          this.dashboardStatsSignal.set(res.data);
        }
      }),
      finalize(() => this.loadingSignal.set(false))
    );
  }

  loadInsights(): Observable<ApiResponse<AnalyticsInsightsResponse>> {
    this.insightsLoadingSignal.set(true);
    return this.http.get<ApiResponse<AnalyticsInsightsResponse>>(
      `${environment.apiUrl}/analytics/insights`
    ).pipe(
      tap(res => {
        if (res.data?.insights) {
          this.insightsSignal.set(res.data.insights);
        }
      }),
      finalize(() => this.insightsLoadingSignal.set(false))
    );
  }
}
