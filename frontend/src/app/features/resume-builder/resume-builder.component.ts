import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';
import { ResumeGeneratorService } from '@core/services/resume-generator.service';
import { ResumeTemplate, ResumeTemplateData } from '@features/my-resumes/models';
import { TemplateSelectorComponent } from '@features/my-resumes/components/template-selector/template-selector.component';
import { ResumePreviewComponent } from '@features/my-resumes/components/resume-preview/resume-preview.component';

@Component({
  selector: 'app-resume-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TemplateSelectorComponent,
    ResumePreviewComponent
  ],
  templateUrl: './resume-builder.component.html',
  styleUrls: ['./resume-builder.component.scss']
})
export class ResumeBuilderComponent {
  private resumeGeneratorService = inject(ResumeGeneratorService);
  private toastr = inject(ToastrService);

  jobDescription = signal<string>('');
  selectedTemplate = signal<ResumeTemplate>('classic');
  generatedResume = signal<ResumeTemplateData | null>(null);

  loading = this.resumeGeneratorService.loading;
  error = this.resumeGeneratorService.error;

  onTemplateChange(template: ResumeTemplate): void {
    this.selectedTemplate.set(template);
  }

  generateResume(): void {
    const description = this.jobDescription().trim();

    if (description.length < 50) {
      this.toastr.error('Please enter a job description (at least 50 characters)', 'Input Required');
      return;
    }

    this.resumeGeneratorService.generateResume(description).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.generatedResume.set(response.data);
          this.toastr.success('Resume generated successfully!', 'Success');
        }
      },
      error: () => {
        this.toastr.error(
          this.error() || 'Failed to generate resume',
          'Generation Failed'
        );
      }
    });
  }

  downloadPdf(): void {
    if (!this.generatedResume()) {
      this.toastr.warning('Generate a resume first', 'No Resume');
      return;
    }
    setTimeout(() => { window.print(); }, 100);
  }

  reset(): void {
    this.jobDescription.set('');
    this.generatedResume.set(null);
    this.resumeGeneratorService.clearError();
  }
}
