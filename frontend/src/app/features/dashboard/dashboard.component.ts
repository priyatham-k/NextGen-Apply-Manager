import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { JobService } from '@core/services/job.service';
import { ApplicationService } from '@core/services/application.service';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink
  ],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  private jobService = inject(JobService);
  private applicationService = inject(ApplicationService);
  private authService = inject(AuthService);
  
  // Signals for reactive state
  loading = signal(true);
  stats = signal({
    totalJobs: 0,
    totalApplications: 0,
    pendingApplications: 0,
    successfulApplications: 0,
    averageMatchScore: 0
  });
  
  // Computed values
  currentUser = this.authService.currentUser;
  highMatchJobs = this.jobService.highMatchJobs;
  recentApplications = computed(() => 
    this.applicationService.applications().slice(0, 5)
  );
  
  ngOnInit(): void {
    this.loadDashboardData();
  }
  
  private async loadDashboardData(): Promise<void> {
    try {
      // Load jobs and applications in parallel
      await Promise.all([
        this.jobService.getJobs({ minMatchScore: 70 }, 1, 10).toPromise(),
        this.applicationService.getApplications({}, 1, 10).toPromise()
      ]);
      
      // Calculate stats
      this.stats.set({
        totalJobs: this.jobService.totalJobs(),
        totalApplications: this.applicationService.totalApplications(),
        pendingApplications: this.applicationService.pendingApplications(),
        successfulApplications: this.applicationService.submittedApplications(),
        averageMatchScore: this.calculateAverageMatchScore()
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      this.loading.set(false);
    }
  }
  
  private calculateAverageMatchScore(): number {
    const jobs = this.jobService.jobs();
    if (jobs.length === 0) return 0;
    
    const total = jobs.reduce((sum, job) => sum + (job.matchScore ?? 0), 0);
    return Math.round(total / jobs.length);
  }
  
  refreshData(): void {
    this.loading.set(true);
    this.loadDashboardData();
  }
}
