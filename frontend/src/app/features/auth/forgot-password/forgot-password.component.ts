import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent {
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  forgotForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  loading = signal(false);
  submitted = signal(false);
  error = signal('');

  get email() {
    return this.forgotForm.get('email');
  }

  async onSubmit(): Promise<void> {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await firstValueFrom(this.authService.forgotPassword(this.forgotForm.value.email));
      this.submitted.set(true);
    } catch (err: any) {
      this.error.set(err.error?.message || 'Something went wrong. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }
}
