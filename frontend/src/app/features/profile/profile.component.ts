import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '@core/services/auth.service';
import { User } from '@models/index';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);

  user = signal<User | null>(null);
  profileForm!: FormGroup;
  loading = signal(false);
  uploadingPicture = signal(false);
  picturePreview = signal<string | null>(null);

  ngOnInit(): void {
    this.user.set(this.authService.currentUser());
    this.initializeForm();
  }

  private initializeForm(): void {
    const currentUser = this.user();

    this.profileForm = this.fb.group({
      firstName: [currentUser?.firstName || '', [Validators.required, Validators.minLength(2)]],
      lastName: [currentUser?.lastName || '', [Validators.required, Validators.minLength(2)]],
      email: [currentUser?.email || '', [Validators.required, Validators.email]]
    });
  }

  get firstName() {
    return this.profileForm.get('firstName');
  }

  get lastName() {
    return this.profileForm.get('lastName');
  }

  get email() {
    return this.profileForm.get('email');
  }

  get hasProfilePicture(): boolean {
    return !!this.user()?.profilePicture;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      this.toastr.error('File size must be less than 5MB', 'Upload Failed');
      input.value = '';
      return;
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.toastr.error('Only JPEG, PNG, GIF, and WebP images are allowed', 'Upload Failed');
      input.value = '';
      return;
    }

    // Generate preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.picturePreview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload
    this.uploadPicture(file);

    // Reset input
    input.value = '';
  }

  async uploadPicture(file: File): Promise<void> {
    this.uploadingPicture.set(true);

    try {
      const response = await firstValueFrom(this.authService.uploadProfilePicture(file));

      if (response.success && response.data) {
        this.user.set(response.data);
        this.toastr.success('Profile picture uploaded successfully', 'Success');
      }
    } catch (error: any) {
      console.error('Upload error:', error);
      this.toastr.error(
        error.error?.message || 'Failed to upload profile picture',
        'Upload Failed'
      );
      this.picturePreview.set(null);
    } finally {
      this.uploadingPicture.set(false);
    }
  }

  async onRemovePicture(): Promise<void> {
    if (!confirm('Are you sure you want to remove your profile picture?')) {
      return;
    }

    this.uploadingPicture.set(true);

    try {
      const response = await firstValueFrom(this.authService.removeProfilePicture());

      if (response.success && response.data) {
        this.user.set(response.data);
        this.picturePreview.set(null);
        this.toastr.success('Profile picture removed successfully', 'Success');
      }
    } catch (error: any) {
      console.error('Remove picture error:', error);
      this.toastr.error(
        error.error?.message || 'Failed to remove profile picture',
        'Error'
      );
    } finally {
      this.uploadingPicture.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    try {
      const { firstName, lastName, email } = this.profileForm.value;

      const response = await firstValueFrom(
        this.authService.updateProfile({ firstName, lastName, email })
      );

      if (response.success && response.data) {
        this.user.set(response.data);
        this.toastr.success('Profile updated successfully', 'Success');
      }
    } catch (error: any) {
      console.error('Update profile error:', error);
      this.toastr.error(
        error.error?.message || 'Failed to update profile',
        'Update Failed'
      );
    } finally {
      this.loading.set(false);
    }
  }
}
