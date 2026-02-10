import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-top-matches',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid py-4">
      <h1 class="display-5 fw-bold">Top Matching Jobs</h1>
      <p class="lead">Discover jobs that best match your resume and skills</p>
      <div class="alert alert-info mt-4">
        <i class="bi bi-info-circle me-2"></i>
        Job matching feature coming soon!
      </div>
    </div>
  `,
  styles: []
})
export class TopMatchesComponent {}
