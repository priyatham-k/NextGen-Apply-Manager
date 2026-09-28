import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '@core/services/analytics.service';

const STATUS_COLORS: Record<string, string> = {
  pending: '#94a3b8',
  submitted: '#1DA1F2',
  in_review: '#8b5cf6',
  interview_scheduled: '#f59e0b',
  offer_received: '#22c55e',
  accepted: '#16a34a',
  rejected: '#ef4444',
  failed: '#dc2626',
  declined: '#6b7280'
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  submitted: 'Submitted',
  in_review: 'In Review',
  interview_scheduled: 'Interview',
  offer_received: 'Offer',
  accepted: 'Accepted',
  rejected: 'Rejected',
  failed: 'Failed',
  declined: 'Declined'
};

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit {
  Math = Math;

  private analyticsService = inject(AnalyticsService);

  stats = this.analyticsService.stats;
  loading = this.analyticsService.loading;
  insights = this.analyticsService.insights;
  insightsLoading = this.analyticsService.insightsLoading;

  interviewCount = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    return s.applicationsByStatus
      .filter(x => x.status === 'interview_scheduled')
      .reduce((sum, x) => sum + x.count, 0);
  });

  successRate = computed(() => {
    const s = this.stats();
    if (!s || s.totalApplications === 0) return 0;
    return Math.round((s.successfulApplications / s.totalApplications) * 100);
  });

  statusItems = computed(() => {
    const s = this.stats();
    if (!s) return [];
    return s.applicationsByStatus
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .map(x => ({
        status: x.status,
        count: x.count,
        label: STATUS_LABELS[x.status] || x.status,
        color: STATUS_COLORS[x.status] || '#94a3b8'
      }));
  });

  donutGradient = computed(() => {
    const items = this.statusItems();
    const total = this.stats()?.totalApplications || 0;
    if (total === 0) return 'conic-gradient(#e2e8f0 0% 100%)';

    const segments: string[] = [];
    let cumulative = 0;
    for (const item of items) {
      const pct = (item.count / total) * 100;
      segments.push(`${item.color} ${cumulative}% ${cumulative + pct}%`);
      cumulative += pct;
    }
    return `conic-gradient(${segments.join(', ')})`;
  });

  maxCompanyCount = computed(() => {
    const s = this.stats();
    if (!s || s.topCompanies.length === 0) return 1;
    return Math.max(...s.topCompanies.map(c => c.count));
  });

  maxTimelineValue = computed(() => {
    const s = this.stats();
    if (!s) return 0;
    return Math.max(...s.applicationTimeline.map(d => d.applications), 0);
  });

  ngOnInit(): void {
    this.analyticsService.loadDashboard().subscribe({
      next: () => this.analyticsService.loadInsights().subscribe()
    });
  }

  refresh(): void {
    this.analyticsService.loadDashboard().subscribe({
      next: () => this.analyticsService.loadInsights().subscribe()
    });
  }

  refreshInsights(): void {
    this.analyticsService.loadInsights().subscribe();
  }

  statusPercent(count: number): number {
    const total = this.stats()?.totalApplications || 0;
    if (total === 0) return 0;
    return Math.round((count / total) * 100);
  }

  companyBarWidth(count: number): number {
    return Math.round((count / this.maxCompanyCount()) * 100);
  }

  timelineBarHeight(value: number): number {
    const max = this.maxTimelineValue();
    if (max === 0) return 0;
    return Math.max(3, Math.round((value / max) * 100));
  }

  timelineXPosition(index: number): number {
    return (index / 29) * 100;
  }

  showDateLabel(date: string): boolean {
    const day = parseInt(date.slice(8, 10), 10);
    return day === 1 || day % 7 === 0;
  }

  formatShortDate(date: string): string {
    const d = new Date(date + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
