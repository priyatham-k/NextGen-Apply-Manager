import { Injectable, signal, computed, inject, effect, DestroyRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { io, Socket } from 'socket.io-client';
import { environment } from '@environments/environment';
import { AppNotification, ApiResponse } from '@models/index';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private toastr = inject(ToastrService);
  private destroyRef = inject(DestroyRef);

  private socket: Socket | null = null;

  // State signals
  private notificationsSignal = signal<AppNotification[]>([]);
  private unreadCountSignal = signal(0);
  private dropdownOpenSignal = signal(false);
  private loadingSignal = signal(false);

  // Public readonly signals
  notifications = this.notificationsSignal.asReadonly();
  unreadCount = this.unreadCountSignal.asReadonly();
  dropdownOpen = this.dropdownOpenSignal.asReadonly();
  loading = this.loadingSignal.asReadonly();

  constructor() {
    // Auto-connect/disconnect based on auth state
    effect(() => {
      if (this.authService.isAuthenticated()) {
        this.connect();
        this.loadUnreadCount();
      } else {
        this.disconnect();
        this.notificationsSignal.set([]);
        this.unreadCountSignal.set(0);
      }
    });

    this.destroyRef.onDestroy(() => this.disconnect());
  }

  private connect(): void {
    if (this.socket?.connected) return;

    const token = this.authService.getToken();
    if (!token) return;

    // Derive socket URL from apiUrl (strip /api/v1)
    const socketUrl = environment.apiUrl.replace(/\/api\/v1$/, '');

    this.socket = io(socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('notification', (notification: AppNotification) => {
      // Prepend new notification
      this.notificationsSignal.update(list => [notification, ...list]);
      this.unreadCountSignal.update(count => count + 1);

      // Show toast
      this.toastr.info(notification.message, notification.title, {
        timeOut: 5000,
        positionClass: 'toast-top-right'
      });
    });

    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }

  private disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  loadNotifications(page = 1, limit = 20): void {
    this.loadingSignal.set(true);
    this.http.get<any>(
      `${environment.apiUrl}/notifications?page=${page}&limit=${limit}`
    ).subscribe({
      next: (res) => {
        if (res.success) {
          if (page === 1) {
            this.notificationsSignal.set(res.data);
          } else {
            this.notificationsSignal.update(list => [...list, ...res.data]);
          }
        }
        this.loadingSignal.set(false);
      },
      error: () => this.loadingSignal.set(false)
    });
  }

  loadUnreadCount(): void {
    this.http.get<any>(
      `${environment.apiUrl}/notifications/unread-count`
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.unreadCountSignal.set(res.data.count);
        }
      }
    });
  }

  markAsRead(id: string): void {
    this.http.patch<any>(
      `${environment.apiUrl}/notifications/${id}/read`, {}
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.notificationsSignal.update(list =>
            list.map(n => n._id === id ? { ...n, read: true } : n)
          );
          this.unreadCountSignal.update(count => Math.max(0, count - 1));
        }
      }
    });
  }

  markAllAsRead(): void {
    this.http.patch<any>(
      `${environment.apiUrl}/notifications/read-all`, {}
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.notificationsSignal.update(list =>
            list.map(n => ({ ...n, read: true }))
          );
          this.unreadCountSignal.set(0);
        }
      }
    });
  }

  deleteNotification(id: string): void {
    this.http.delete<any>(
      `${environment.apiUrl}/notifications/${id}`
    ).subscribe({
      next: (res) => {
        if (res.success) {
          const notification = this.notificationsSignal().find(n => n._id === id);
          this.notificationsSignal.update(list => list.filter(n => n._id !== id));
          if (notification && !notification.read) {
            this.unreadCountSignal.update(count => Math.max(0, count - 1));
          }
        }
      }
    });
  }

  toggleDropdown(): void {
    const isOpen = !this.dropdownOpenSignal();
    this.dropdownOpenSignal.set(isOpen);
    if (isOpen) {
      this.loadNotifications();
    }
  }

  closeDropdown(): void {
    this.dropdownOpenSignal.set(false);
  }
}
