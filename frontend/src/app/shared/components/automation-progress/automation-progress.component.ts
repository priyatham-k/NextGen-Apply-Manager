import { Component, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AutomationService } from '@core/services/automation.service';

@Component({
  selector: 'app-automation-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './automation-progress.component.html',
  styleUrls: ['./automation-progress.component.scss']
})
export class AutomationProgressComponent {
  private automationService = inject(AutomationService);
  private router = inject(Router);

  progress = this.automationService.progressSignal;
  completionStatus = this.automationService.statusSignal;

  minimized = signal(false);
  dismissed = signal(false);

  isVisible = computed(() => {
    if (this.dismissed()) return false;
    return this.progress() !== null || this.completionStatus() !== null;
  });

  statusLabel = computed(() => {
    const status = this.completionStatus();
    if (status?.status === 'success') return 'Submitted!';
    if (status?.status === 'failed') return 'Failed';
    return 'In Progress';
  });

  statusClass = computed(() => {
    const status = this.completionStatus();
    if (status?.status === 'success') return 'status-success';
    if (status?.status === 'failed') return 'status-failed';
    return 'status-progress';
  });

  toggleMinimize(): void {
    this.minimized.set(!this.minimized());
  }

  dismiss(): void {
    this.dismissed.set(true);
    this.automationService.clearProgress();
  }

  viewApplication(): void {
    const status = this.completionStatus();
    const progress = this.progress();
    const appId = status?.applicationId || progress?.applicationId;
    if (appId) {
      this.dismiss();
      this.router.navigate(['/applications', appId]);
    }
  }
}
