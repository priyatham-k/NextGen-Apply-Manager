import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-resume-builder',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="container-fluid py-4">
      <h1 class="display-5 fw-bold">Resume Builder</h1>
      <p class="lead">Build and customize your professional resume</p>
      <div class="alert alert-info mt-4">
        <i class="bi bi-info-circle me-2"></i>
        Resume builder feature coming soon!
      </div>
    </div>
  `,
  styles: []
})
export class ResumeBuilderComponent {}
