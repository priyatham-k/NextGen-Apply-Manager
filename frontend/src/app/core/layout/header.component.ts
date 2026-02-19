import { Component, output, inject, ElementRef, HostListener } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/services/auth.service';
import { NotificationService } from '@core/services/notification.service';
import { AppNotification, NotificationType } from '@models/index';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.scss']
})
export class HeaderComponent {
  private authService = inject(AuthService);
  private elementRef = inject(ElementRef);
  private router = inject(Router);
  notificationService = inject(NotificationService);

  toggleSidebar = output<void>();
  currentUser = this.authService.currentUser;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    const notificationWrapper = this.elementRef.nativeElement.querySelector('.notification-wrapper');
    if (notificationWrapper && !notificationWrapper.contains(target)) {
      this.notificationService.closeDropdown();
    }
  }

  onLogout(): void {
    this.authService.logout();
  }

  onToggleSidebar(): void {
    this.toggleSidebar.emit();
  }

  toggleNotifications(): void {
    this.notificationService.toggleDropdown();
  }

  onMarkAllRead(): void {
    this.notificationService.markAllAsRead();
  }

  onNotificationClick(notification: AppNotification): void {
    if (!notification.read) {
      this.notificationService.markAsRead(notification._id);
    }

    this.notificationService.closeDropdown();

    if (notification.data?.applicationId) {
      this.router.navigate(['/applications', notification.data.applicationId]);
    } else if (notification.data?.jobId) {
      this.router.navigate(['/jobs', notification.data.jobId]);
    } else {
      this.router.navigate(['/notifications']);
    }
  }

  onDeleteNotification(event: Event, id: string): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(id);
  }

  getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case NotificationType.APPLICATION_SUBMITTED:
        return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z';
      case NotificationType.APPLICATION_STATUS_CHANGED:
        return 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15';
      case NotificationType.JOB_MATCH:
        return 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z';
      default:
        return 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z';
    }
  }
}
