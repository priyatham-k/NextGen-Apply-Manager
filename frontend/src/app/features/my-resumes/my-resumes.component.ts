import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { ToastrService } from 'ngx-toastr';

interface Experience {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
}

interface Education {
  school: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  description: string;
}

@Component({
  selector: 'app-my-resumes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './my-resumes.component.html',
  styleUrls: ['./my-resumes.component.scss']
})
export class MyResumesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);

  resumeForm!: FormGroup;
  loading = signal(false);
  previewMode = signal(false);
  savedResumes = signal<any[]>([]);
  currentResumeTitle = signal<string>('');

  ngOnInit(): void {
    this.initializeForm();
    this.loadSavedResumesList();
  }

  private initializeForm(): void {
    this.resumeForm = this.fb.group({
      // Resume Title
      title: ['My Resume', [Validators.required, Validators.minLength(3)]],

      // Personal Information
      fullName: ['', [Validators.required, Validators.minLength(3)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required]],
      location: ['', [Validators.required]],
      linkedin: [''],
      github: [''],
      website: [''],

      // Professional Summary
      summary: ['', [Validators.required, Validators.minLength(50)]],

      // Experience
      experiences: this.fb.array([this.createExperience()]),

      // Education
      education: this.fb.array([this.createEducation()]),

      // Skills
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

  togglePreview(): void {
    if (this.resumeForm.invalid) {
      this.toastr.error('Please fill all required fields', 'Form Invalid');
      this.resumeForm.markAllAsTouched();
      return;
    }
    this.previewMode.set(!this.previewMode());
  }

  downloadResume(): void {
    if (this.resumeForm.invalid) {
      this.toastr.error('Please fill all required fields', 'Form Invalid');
      this.resumeForm.markAllAsTouched();
      return;
    }

    // Set preview mode to show full resume
    this.previewMode.set(true);

    // Small delay to ensure DOM updates before printing
    setTimeout(() => {
      window.print();
    }, 100);
  }

  saveResume(): void {
    if (this.resumeForm.invalid) {
      this.toastr.error('Please fill all required fields', 'Form Invalid');
      this.resumeForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);

    try {
      const resumeData = this.resumeForm.value;
      const title = resumeData.title || 'My Resume';

      // Get existing resumes
      const existingResumes = JSON.parse(localStorage.getItem('savedResumes') || '[]');

      // Check if resume with same title exists
      const existingIndex = existingResumes.findIndex((r: any) => r.title === title);

      if (existingIndex >= 0) {
        // Update existing resume
        existingResumes[existingIndex] = {
          ...resumeData,
          updatedAt: new Date().toISOString()
        };
        this.toastr.success('Resume updated successfully', 'Success');
      } else {
        // Add new resume
        existingResumes.push({
          ...resumeData,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        this.toastr.success('Resume saved successfully', 'Success');
      }

      localStorage.setItem('savedResumes', JSON.stringify(existingResumes));
      this.currentResumeTitle.set(title);
      this.loadSavedResumesList();
    } catch (error) {
      this.toastr.error('Failed to save resume', 'Error');
    } finally {
      this.loading.set(false);
    }
  }

  loadSavedResumesList(): void {
    const savedResumes = JSON.parse(localStorage.getItem('savedResumes') || '[]');
    this.savedResumes.set(savedResumes);
  }

  loadResume(resume: any): void {
    this.resumeForm.patchValue(resume);

    // Clear and rebuild arrays
    while (this.experiences.length) {
      this.experiences.removeAt(0);
    }
    while (this.education.length) {
      this.education.removeAt(0);
    }

    // Add experiences
    if (resume.experiences) {
      resume.experiences.forEach((exp: any) => {
        const experienceGroup = this.createExperience();
        experienceGroup.patchValue(exp);
        this.experiences.push(experienceGroup);
      });
    }

    // Add education
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
    if (!confirm(`Are you sure you want to delete "${title}"?`)) {
      return;
    }

    const existingResumes = JSON.parse(localStorage.getItem('savedResumes') || '[]');
    const updatedResumes = existingResumes.filter((r: any) => r.title !== title);
    localStorage.setItem('savedResumes', JSON.stringify(updatedResumes));
    this.loadSavedResumesList();
    this.toastr.success('Resume deleted successfully', 'Success');

    if (this.currentResumeTitle() === title) {
      this.currentResumeTitle.set('');
    }
  }

  newResume(): void {
    this.resumeForm.reset();
    this.resumeForm.patchValue({ title: 'New Resume' });

    // Reset arrays to one item
    while (this.experiences.length) {
      this.experiences.removeAt(0);
    }
    while (this.education.length) {
      this.education.removeAt(0);
    }

    this.experiences.push(this.createExperience());
    this.education.push(this.createEducation());

    this.currentResumeTitle.set('');
    this.toastr.info('Started new resume', 'Info');
  }

  get skillsArray(): string[] {
    const skills = this.resumeForm.get('skills')?.value || '';
    return skills.split(',').map((s: string) => s.trim()).filter((s: string) => s);
  }
}
