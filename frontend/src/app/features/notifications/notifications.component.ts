import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { NotificationService } from '../../core/services/notification.service';
import { AppNotification, NotificationType } from '../../models';

type FilterType = 'all' | 'unread' | NotificationType;

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './notifications.component.html',
  styleUrls: ['./notifications.component.scss']
})
export class NotificationsComponent implements OnInit {
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  activeFilter = signal<FilterType>('all');
  currentPage = signal(1);

  notifications = this.notificationService.notifications;
  unreadCount = this.notificationService.unreadCount;
  loading = this.notificationService.loading;

  filteredNotifications = computed(() => {
    const filter = this.activeFilter();
    const list = this.notifications();

    if (filter === 'all') return list;
    if (filter === 'unread') return list.filter(n => !n.read);
    return list.filter(n => n.type === filter);
  });

  filters: { label: string; value: FilterType; icon: string }[] = [
    { label: 'All', value: 'all', icon: 'bi-inbox' },
    { label: 'Unread', value: 'unread', icon: 'bi-envelope' },
    { label: 'Applications', value: NotificationType.APPLICATION_SUBMITTED, icon: 'bi-check-circle' },
    { label: 'Status Updates', value: NotificationType.APPLICATION_STATUS_CHANGED, icon: 'bi-arrow-repeat' },
    { label: 'Job Matches', value: NotificationType.JOB_MATCH, icon: 'bi-briefcase' },
    { label: 'System', value: NotificationType.SYSTEM, icon: 'bi-info-circle' },
  ];

  ngOnInit(): void {
    this.notificationService.loadNotifications(1, 50);
  }

  setFilter(filter: FilterType): void {
    this.activeFilter.set(filter);
  }

  onNotificationClick(notification: AppNotification): void {
    if (!notification.read) {
      this.notificationService.markAsRead(notification._id);
    }

    if (notification.data?.applicationId) {
      this.router.navigate(['/applications', notification.data.applicationId]);
    } else if (notification.data?.jobId) {
      this.router.navigate(['/jobs', notification.data.jobId]);
    }
  }

  markAllAsRead(): void {
    this.notificationService.markAllAsRead();
  }

  deleteNotification(event: Event, id: string): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(id);
  }

  loadMore(): void {
    const nextPage = this.currentPage() + 1;
    this.currentPage.set(nextPage);
    this.notificationService.loadNotifications(nextPage, 50);
  }

  getIcon(type: NotificationType): string {
    switch (type) {
      case NotificationType.APPLICATION_SUBMITTED: return 'bi-check-circle-fill';
      case NotificationType.APPLICATION_STATUS_CHANGED: return 'bi-arrow-repeat';
      case NotificationType.JOB_MATCH: return 'bi-briefcase-fill';
      case NotificationType.SYSTEM: return 'bi-info-circle-fill';
      default: return 'bi-bell-fill';
    }
  }

  getIconColor(type: NotificationType): string {
    switch (type) {
      case NotificationType.APPLICATION_SUBMITTED: return '#22c55e';
      case NotificationType.APPLICATION_STATUS_CHANGED: return '#3b82f6';
      case NotificationType.JOB_MATCH: return '#f59e0b';
      case NotificationType.SYSTEM: return '#8b5cf6';
      default: return '#6b7280';
    }
  }

  getTimeAgo(date: Date): string {
    const now = new Date();
    const d = new Date(date);
    const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
}
