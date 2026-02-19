import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UserSettings } from '@models/index';

type SettingsTab = 'account' | 'notifications' | 'jobPreferences' | 'privacy';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.scss']
})
export class SettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);

  private apiUrl = `${environment.apiUrl}/settings`;

  // State
  activeTab = signal<SettingsTab>('account');
  loading = signal(false);
  saving = signal(false);
  changingPassword = signal(false);

  // Forms
  passwordForm!: FormGroup;
  notificationsForm!: FormGroup;
  jobPreferencesForm!: FormGroup;
  privacyForm!: FormGroup;

  // Tab config
  tabs: { key: SettingsTab; label: string; icon: string }[] = [
    { key: 'account', label: 'Account', icon: 'bi-person-gear' },
    { key: 'notifications', label: 'Notifications', icon: 'bi-bell' },
    { key: 'jobPreferences', label: 'Job Preferences', icon: 'bi-briefcase' },
    { key: 'privacy', label: 'Privacy', icon: 'bi-shield-lock' }
  ];

  // Job type options
  jobTypeOptions = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship'];
  currencyOptions = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD'];

  ngOnInit(): void {
    this.initializeForms();
    this.loadSettings();
  }

  private initializeForms(): void {
    this.passwordForm = this.fb.group({
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(6)]],
      confirmPassword: ['', [Validators.required]]
    });

    this.notificationsForm = this.fb.group({
      emailNotifications: [true],
      applicationUpdates: [true],
      jobRecommendations: [true],
      systemNotifications: [true]
    });

    this.jobPreferencesForm = this.fb.group({
      preferredJobTypes: [[] as string[]],
      preferredLocations: [''],
      salaryMin: [null],
      salaryCurrency: ['USD'],
      willingToRelocate: [false]
    });

    this.privacyForm = this.fb.group({
      profileVisibility: ['private'],
      showEmail: [false]
    });
  }

  private async loadSettings(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(
        this.http.get<{ success: boolean; data: UserSettings }>(this.apiUrl)
      );
      if (response.success && response.data) {
        this.patchForms(response.data);
      }
    } catch {
      this.toastr.error('Failed to load settings', 'Error');
    } finally {
      this.loading.set(false);
    }
  }

  private patchForms(settings: UserSettings): void {
    if (settings.notifications) {
      this.notificationsForm.patchValue(settings.notifications);
    }

    if (settings.jobPreferences) {
      this.jobPreferencesForm.patchValue({
        preferredJobTypes: settings.jobPreferences.preferredJobTypes || [],
        preferredLocations: (settings.jobPreferences.preferredLocations || []).join(', '),
        salaryMin: settings.jobPreferences.salaryMin || null,
        salaryCurrency: settings.jobPreferences.salaryCurrency || 'USD',
        willingToRelocate: settings.jobPreferences.willingToRelocate || false
      });
    }

    if (settings.privacy) {
      this.privacyForm.patchValue(settings.privacy);
    }
  }

  switchTab(tab: SettingsTab): void {
    this.activeTab.set(tab);
  }

  // ─── Job type checkbox toggle ──────────────────────────────
  isJobTypeSelected(type: string): boolean {
    const types: string[] = this.jobPreferencesForm.get('preferredJobTypes')?.value || [];
    return types.includes(type);
  }

  toggleJobType(type: string): void {
    const control = this.jobPreferencesForm.get('preferredJobTypes');
    const current: string[] = control?.value || [];
    if (current.includes(type)) {
      control?.setValue(current.filter(t => t !== type));
    } else {
      control?.setValue([...current, type]);
    }
  }

  // ─── Save Notifications ────────────────────────────────────
  async saveNotifications(): Promise<void> {
    this.saving.set(true);
    try {
      const response = await firstValueFrom(
        this.http.put<{ success: boolean; data: UserSettings }>(this.apiUrl, {
          notifications: this.notificationsForm.value
        })
      );
      if (response.success) {
        this.toastr.success('Notification preferences saved', 'Success');
      }
    } catch {
      this.toastr.error('Failed to save notification preferences', 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Save Job Preferences ─────────────────────────────────
  async saveJobPreferences(): Promise<void> {
    this.saving.set(true);
    try {
      const formValue = this.jobPreferencesForm.value;
      const payload = {
        jobPreferences: {
          preferredJobTypes: formValue.preferredJobTypes,
          preferredLocations: formValue.preferredLocations
            ? formValue.preferredLocations.split(',').map((l: string) => l.trim()).filter(Boolean)
            : [],
          salaryMin: formValue.salaryMin || undefined,
          salaryCurrency: formValue.salaryCurrency,
          willingToRelocate: formValue.willingToRelocate
        }
      };

      const response = await firstValueFrom(
        this.http.put<{ success: boolean; data: UserSettings }>(this.apiUrl, payload)
      );
      if (response.success) {
        this.toastr.success('Job preferences saved', 'Success');
      }
    } catch {
      this.toastr.error('Failed to save job preferences', 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Save Privacy ──────────────────────────────────────────
  async savePrivacy(): Promise<void> {
    this.saving.set(true);
    try {
      const response = await firstValueFrom(
        this.http.put<{ success: boolean; data: UserSettings }>(this.apiUrl, {
          privacy: this.privacyForm.value
        })
      );
      if (response.success) {
        this.toastr.success('Privacy settings saved', 'Success');
      }
    } catch {
      this.toastr.error('Failed to save privacy settings', 'Error');
    } finally {
      this.saving.set(false);
    }
  }

  // ─── Change Password ──────────────────────────────────────
  async changePassword(): Promise<void> {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword, confirmPassword } = this.passwordForm.value;

    if (newPassword !== confirmPassword) {
      this.toastr.error('New password and confirmation do not match', 'Error');
      return;
    }

    this.changingPassword.set(true);
    try {
      const response = await firstValueFrom(
        this.http.put<{ success: boolean; message: string }>(
          `${this.apiUrl}/change-password`,
          { currentPassword, newPassword }
        )
      );
      if (response.success) {
        this.toastr.success('Password changed successfully', 'Success');
        this.passwordForm.reset();
      }
    } catch (error: any) {
      const message = error.error?.message || 'Failed to change password';
      this.toastr.error(message, 'Error');
    } finally {
      this.changingPassword.set(false);
    }
  }
}
