import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-resume-score',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid py-4">
      <h1 class="display-5 fw-bold">Resume Score</h1>
      <p class="lead">Analyze and improve your resume score</p>
      <div class="alert alert-info mt-4">
        <i class="bi bi-info-circle me-2"></i>
        Resume scoring feature coming soon!
      </div>
    </div>
  `,
  styles: []
})
export class ResumeScoreComponent {}
