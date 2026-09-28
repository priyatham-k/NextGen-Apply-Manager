import { Component, computed, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ToastrService } from 'ngx-toastr';
import { ResumeTemplate, ResumeTemplateData } from './models';
import { ResumeFormEditorComponent } from './components/resume-form-editor/resume-form-editor.component';
import { TemplateSelectorComponent } from './components/template-selector/template-selector.component';
import { ResumePreviewComponent } from './components/resume-preview/resume-preview.component';
import { ResumeService } from '../../core/services/resume.service';

@Component({
  selector: 'app-my-resumes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ResumeFormEditorComponent,
    TemplateSelectorComponent,
    ResumePreviewComponent
  ],
  templateUrl: './my-resumes.component.html',
  styleUrls: ['./my-resumes.component.scss']
})
export class MyResumesComponent {
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private resumeService = inject(ResumeService);

  resumeForm: FormGroup;
  loading = signal(false);
  previewMode = signal(false);
  savedResumes = signal<any[]>([]);
  currentResumeTitle = signal<string>('');
  selectedTemplate = signal<ResumeTemplate>('classic');

  private formValues;

  templateData = computed<ResumeTemplateData>(() => {
    const v = this.formValues() || this.resumeForm.value;
    return {
      fullName: v.fullName || '',
      email: v.email || '',
      phone: v.phone || '',
      location: v.location || '',
      linkedin: v.linkedin || '',
      github: v.github || '',
      website: v.website || '',
      summary: v.summary || '',
      experiences: v.experiences || [],
      education: v.education || [],
      skills: (v.skills || '').split(',').map((s: string) => s.trim()).filter((s: string) => s)
    };
  });

  constructor() {
    this.resumeForm = this.initializeForm();
    this.formValues = toSignal(this.resumeForm.valueChanges, { initialValue: this.resumeForm.value });
    this.loadSavedResumesList();
  }

  private initializeForm(): FormGroup {
    return this.fb.group({
      title: ['My Resume', [Validators.required, Validators.minLength(3)]],
      template: ['classic'],
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required]],
      location: ['', [Validators.required]],
      linkedin: [''],
      github: [''],
      website: [''],
      summary: ['', [Validators.required, Validators.minLength(50)]],
      experiences: this.fb.array([this.createExperience()]),
      education: this.fb.array([this.createEducation()]),
      skills: ['', [Validators.required]]
    });
  }

  createExperience(): FormGroup {
    return this.fb.group({
      company: ['', [Validators.required]],
      position: ['', [Validators.required]],
      startDate: ['', [Validators.required]],
      endDate: [''],
      current: [false],
      description: ['', [Validators.required]]
    });
  }

  createEducation(): FormGroup {
    return this.fb.group({
      school: ['', [Validators.required]],
      degree: ['', [Validators.required]],
      field: ['', [Validators.required]],
      startDate: ['', [Validators.required]],
      endDate: ['', [Validators.required]],
      description: ['']
    });
  }

  get experiences(): FormArray {
    return this.resumeForm.get('experiences') as FormArray;
  }

  get education(): FormArray {
    return this.resumeForm.get('education') as FormArray;
  }

  addExperience(): void {
    this.experiences.push(this.createExperience());
  }

  removeExperience(index: number): void {
    if (this.experiences.length > 1) {
      this.experiences.removeAt(index);
    }
  }

  addEducation(): void {
    this.education.push(this.createEducation());
  }

  removeEducation(index: number): void {
    if (this.education.length > 1) {
      this.education.removeAt(index);
    }
  }

  onTemplateChange(template: ResumeTemplate): void {
    this.selectedTemplate.set(template);
    this.resumeForm.patchValue({ template });
  }

  togglePreview(): void {
    this.previewMode.set(!this.previewMode());
  }

  downloadResume(): void {
    this.previewMode.set(true);
    setTimeout(() => { window.print(); }, 300);
  }

  saveResume(): void {
    if (this.resumeForm.invalid) {
      this.toastr.error('Please fill all required fields', 'Form Invalid');
      this.resumeForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const resumeData = this.resumeForm.value;

    // Find existing resume by current loaded title or matching title
    const existingResume = this.savedResumes().find(
      (r: any) => r._id && (r.title === this.currentResumeTitle() || r.title === resumeData.title)
    );

    const operation = existingResume?._id
      ? this.resumeService.updateResume(existingResume._id, resumeData)
      : this.resumeService.createResume(resumeData);

    operation.subscribe({
      next: (res) => {
        if (res.success) {
          const msg = existingResume?._id ? 'Resume updated successfully' : 'Resume saved successfully';
          this.toastr.success(msg, 'Success');
          this.currentResumeTitle.set(resumeData.title);
          this.loadSavedResumesList();
        }
        this.loading.set(false);
      },
      error: (err) => {
        const message = err.error?.message || 'Failed to save resume';
        this.toastr.error(message, 'Error');
        this.loading.set(false);
      }
    });
  }

  loadSavedResumesList(): void {
    this.resumeService.loadResumes().subscribe({
      next: (res) => {
        if (res.success) {
          this.savedResumes.set(res.data || []);
        }
      }
    });
  }

  loadResume(resume: any): void {
    this.resumeForm.patchValue(resume);

    // Restore template (default to classic for old resumes)
    this.selectedTemplate.set(resume.template || 'classic');

    // Clear and rebuild arrays
    while (this.experiences.length) { this.experiences.removeAt(0); }
    while (this.education.length) { this.education.removeAt(0); }

    if (resume.experiences) {
      resume.experiences.forEach((exp: any) => {
        const experienceGroup = this.createExperience();
        experienceGroup.patchValue(exp);
        this.experiences.push(experienceGroup);
      });
    }

    if (resume.education) {
      resume.education.forEach((edu: any) => {
        const educationGroup = this.createEducation();
        educationGroup.patchValue(edu);
        this.education.push(educationGroup);
      });
    }

    this.currentResumeTitle.set(resume.title);
    this.toastr.success(`Resume "${resume.title}" loaded successfully`, 'Success');
  }

  deleteResume(title: string): void {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return;

    const resume = this.savedResumes().find((r: any) => r.title === title);
    if (!resume?._id) return;

    this.resumeService.deleteResume(resume._id).subscribe({
      next: (res) => {
        if (res.success) {
          this.toastr.success('Resume deleted successfully', 'Success');
          this.loadSavedResumesList();
          if (this.currentResumeTitle() === title) {
            this.currentResumeTitle.set('');
          }
        }
      },
      error: () => {
        this.toastr.error('Failed to delete resume', 'Error');
      }
    });
  }

  newResume(): void {
    this.resumeForm.reset();
    this.resumeForm.patchValue({ title: 'New Resume', template: 'classic' });

    while (this.experiences.length) { this.experiences.removeAt(0); }
    while (this.education.length) { this.education.removeAt(0); }

    this.experiences.push(this.createExperience());
    this.education.push(this.createEducation());

    this.selectedTemplate.set('classic');
    this.currentResumeTitle.set('');
    this.toastr.info('Started new resume', 'Info');
  }
}
