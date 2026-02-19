import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@core/services/auth.service';
import { ProfileService } from '@core/services/profile.service';
import { Profile, SkillCategory, SkillLevel, LanguageProficiency } from '@models/index';
import { firstValueFrom } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { environment } from '../../../environments/environment';

type ProfileTab = 'personal' | 'summary' | 'skills' | 'experience' | 'projects' | 'education' | 'certifications' | 'additional';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.scss']
})
export class ProfileComponent implements OnInit {
  authService = inject(AuthService);
  private profileService = inject(ProfileService);
  private fb = inject(FormBuilder);
  private toastr = inject(ToastrService);
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);

  // State
  profile = signal<Profile | null>(null);
  activeTab = signal<ProfileTab>('personal');
  loading = signal(false);
  savingSection = signal<ProfileTab | null>(null);
  uploadingPicture = signal(false);
  picturePreview = signal<string | null>(null);

  // Resume upload state
  onboardingMode = signal(false);
  parsingResume = signal(false);
  dragOver = signal(false);

  // Forms
  personalInfoForm!: FormGroup;
  summaryForm!: FormGroup;
  skillsForm!: FormGroup;
  experienceForm!: FormGroup;
  projectsForm!: FormGroup;
  educationForm!: FormGroup;
  certificationsForm!: FormGroup;
  additionalForm!: FormGroup;

  // Enum values for template dropdowns
  skillCategories = Object.values(SkillCategory);
  skillLevels = Object.values(SkillLevel);
  languageProficiencies = Object.values(LanguageProficiency);

  hasProfilePicture = computed(() => !!this.authService.currentUser()?.profilePicture);

  profileCompleteness = computed(() => {
    const p = this.profile();
    if (!p) return 0;
    let score = 0;
    const total = 8;
    if (p.personalInfo?.phone || p.personalInfo?.linkedin) score++;
    if (p.professionalSummary?.summary) score++;
    if (p.skills?.length > 0) score++;
    if (p.workExperience?.length > 0) score++;
    if (p.projects?.length > 0) score++;
    if (p.education?.length > 0) score++;
    if (p.certifications?.length > 0) score++;
    if ((p.additionalInfo?.languages?.length ?? 0) > 0 || (p.additionalInfo?.awards?.length ?? 0) > 0) score++;
    return Math.round((score / total) * 100);
  });

  tabs: { key: ProfileTab; label: string; icon: string }[] = [
    { key: 'personal', label: 'Personal Info', icon: 'bi-person-badge' },
    { key: 'summary', label: 'Summary', icon: 'bi-file-text' },
    { key: 'skills', label: 'Skills', icon: 'bi-code-slash' },
    { key: 'experience', label: 'Experience', icon: 'bi-briefcase' },
    { key: 'projects', label: 'Projects', icon: 'bi-folder' },
    { key: 'education', label: 'Education', icon: 'bi-mortarboard' },
    { key: 'certifications', label: 'Certifications', icon: 'bi-award' },
    { key: 'additional', label: 'Additional', icon: 'bi-plus-circle' }
  ];

  // Show upload banner when onboarding or profile is mostly empty
  showUploadBanner = computed(() => this.onboardingMode() || this.profileCompleteness() < 20);

  async ngOnInit(): Promise<void> {
    // Check for onboarding query param
    const params = this.route.snapshot.queryParams;
    if (params['onboarding'] === 'true') {
      this.onboardingMode.set(true);
    }
    await this.loadProfile();
  }

  private async loadProfile(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await firstValueFrom(this.profileService.getFullProfile());
      if (response.success && response.data) {
        this.profile.set(response.data);
      }
    } catch (error: any) {
      this.toastr.error('Failed to load profile', 'Error');
    } finally {
      this.loading.set(false);
      this.initializeForms();
    }
  }

  private initializeForms(): void {
    const p = this.profile();

    this.personalInfoForm = this.fb.group({
      firstName: [p?.personalInfo?.firstName || '', [Validators.required, Validators.minLength(2)]],
      middleName: [p?.personalInfo?.middleName || ''],
      lastName: [p?.personalInfo?.lastName || '', [Validators.required, Validators.minLength(2)]],
      email: [p?.personalInfo?.email || '', [Validators.required, Validators.email]],
      phone: [p?.personalInfo?.phone || ''],
      city: [p?.personalInfo?.address?.city || ''],
      country: [p?.personalInfo?.address?.country || ''],
      linkedin: [p?.personalInfo?.linkedin || ''],
      github: [p?.personalInfo?.github || ''],
      portfolio: [p?.personalInfo?.portfolio || ''],
      website: [p?.personalInfo?.website || '']
    });

    this.summaryForm = this.fb.group({
      summary: [p?.professionalSummary?.summary || '', Validators.maxLength(1000)],
      yearsOfExperience: [p?.professionalSummary?.yearsOfExperience || 0, [Validators.min(0)]],
      coreCompetencies: [p?.professionalSummary?.coreCompetencies?.join(', ') || ''],
      specialization: [p?.professionalSummary?.specialization || '']
    });

    this.skillsForm = this.fb.group({ skills: this.fb.array([]) });
    p?.skills?.forEach(s => this.skillsArray.push(this.createSkillGroup(s)));

    this.experienceForm = this.fb.group({ experiences: this.fb.array([]) });
    p?.workExperience?.forEach(e => this.experiencesArray.push(this.createExperienceGroup(e)));

    this.projectsForm = this.fb.group({ projects: this.fb.array([]) });
    p?.projects?.forEach(pr => this.projectsArray.push(this.createProjectGroup(pr)));

    this.educationForm = this.fb.group({ education: this.fb.array([]) });
    p?.education?.forEach(ed => this.educationArray.push(this.createEducationGroup(ed)));

    this.certificationsForm = this.fb.group({ certifications: this.fb.array([]) });
    p?.certifications?.forEach(c => this.certificationsArray.push(this.createCertificationGroup(c)));

    this.additionalForm = this.fb.group({
      awards: this.fb.array([]),
      publications: this.fb.array([]),
      languages: this.fb.array([]),
      volunteerExperience: this.fb.array([])
    });
    p?.additionalInfo?.awards?.forEach(a => this.awardsArray.push(this.createAwardGroup(a)));
    p?.additionalInfo?.publications?.forEach(pb => this.publicationsArray.push(this.createPublicationGroup(pb)));
    p?.additionalInfo?.languages?.forEach(l => this.languagesArray.push(this.createLanguageGroup(l)));
    p?.additionalInfo?.volunteerExperience?.forEach(v => this.volunteerArray.push(this.createVolunteerGroup(v)));
  }

  // ─── FormArray getters ────────────────────────────────────────
  get skillsArray(): FormArray { return this.skillsForm.get('skills') as FormArray; }
  get experiencesArray(): FormArray { return this.experienceForm.get('experiences') as FormArray; }
  get projectsArray(): FormArray { return this.projectsForm.get('projects') as FormArray; }
  get educationArray(): FormArray { return this.educationForm.get('education') as FormArray; }
  get certificationsArray(): FormArray { return this.certificationsForm.get('certifications') as FormArray; }
  get awardsArray(): FormArray { return this.additionalForm.get('awards') as FormArray; }
  get publicationsArray(): FormArray { return this.additionalForm.get('publications') as FormArray; }
  get languagesArray(): FormArray { return this.additionalForm.get('languages') as FormArray; }
  get volunteerArray(): FormArray { return this.additionalForm.get('volunteerExperience') as FormArray; }

  // ─── FormGroup creators ───────────────────────────────────────
  private createSkillGroup(s?: any): FormGroup {
    return this.fb.group({
      name: [s?.name || '', Validators.required],
      category: [s?.category || SkillCategory.OTHER, Validators.required],
      level: [s?.level || SkillLevel.INTERMEDIATE, Validators.required],
      yearsOfExperience: [s?.yearsOfExperience || 0]
    });
  }

  private createExperienceGroup(e?: any): FormGroup {
    return this.fb.group({
      company: [e?.company || '', Validators.required],
      position: [e?.position || '', Validators.required],
      location: [e?.location || ''],
      startDate: [e?.startDate ? this.toMonthInput(e.startDate) : ''],
      endDate: [{ value: e?.endDate ? this.toMonthInput(e.endDate) : '', disabled: e?.current || false }],
      current: [e?.current || false],
      description: [e?.description || ''],
      achievements: [e?.achievements?.join('\n') || ''],
      technologies: [e?.technologies?.join(', ') || '']
    });
  }

  private createProjectGroup(p?: any): FormGroup {
    return this.fb.group({
      name: [p?.name || '', Validators.required],
      description: [p?.description || ''],
      role: [p?.role || ''],
      technologies: [p?.technologies?.join(', ') || ''],
      startDate: [p?.startDate ? this.toMonthInput(p.startDate) : ''],
      endDate: [{ value: p?.endDate ? this.toMonthInput(p.endDate) : '', disabled: p?.current || false }],
      current: [p?.current || false],
      githubUrl: [p?.githubUrl || ''],
      demoUrl: [p?.demoUrl || '']
    });
  }

  private createEducationGroup(ed?: any): FormGroup {
    return this.fb.group({
      institution: [ed?.institution || '', Validators.required],
      degree: [ed?.degree || '', Validators.required],
      field: [ed?.field || ''],
      location: [ed?.location || ''],
      startDate: [ed?.startDate ? this.toMonthInput(ed.startDate) : ''],
      endDate: [ed?.endDate ? this.toMonthInput(ed.endDate) : ''],
      gpa: [ed?.gpa || null],
      achievements: [ed?.achievements?.join('\n') || '']
    });
  }

  private createCertificationGroup(c?: any): FormGroup {
    return this.fb.group({
      name: [c?.name || '', Validators.required],
      issuer: [c?.issuer || '', Validators.required],
      issueDate: [c?.issueDate ? this.toMonthInput(c.issueDate) : ''],
      expiryDate: [c?.expiryDate ? this.toMonthInput(c.expiryDate) : ''],
      credentialId: [c?.credentialId || ''],
      credentialUrl: [c?.credentialUrl || '']
    });
  }

  private createAwardGroup(a?: any): FormGroup {
    return this.fb.group({
      title: [a?.title || '', Validators.required],
      issuer: [a?.issuer || ''],
      date: [a?.date ? this.toMonthInput(a.date) : ''],
      description: [a?.description || '']
    });
  }

  private createPublicationGroup(p?: any): FormGroup {
    return this.fb.group({
      title: [p?.title || '', Validators.required],
      publisher: [p?.publisher || ''],
      publishDate: [p?.publishDate ? this.toMonthInput(p.publishDate) : ''],
      url: [p?.url || ''],
      authors: [p?.authors?.join(', ') || '']
    });
  }

  private createLanguageGroup(l?: any): FormGroup {
    return this.fb.group({
      name: [l?.name || '', Validators.required],
      proficiency: [l?.proficiency || LanguageProficiency.PROFESSIONAL_WORKING, Validators.required]
    });
  }

  private createVolunteerGroup(v?: any): FormGroup {
    return this.fb.group({
      organization: [v?.organization || '', Validators.required],
      role: [v?.role || '', Validators.required],
      startDate: [v?.startDate ? this.toMonthInput(v.startDate) : ''],
      endDate: [{ value: v?.endDate ? this.toMonthInput(v.endDate) : '', disabled: v?.current || false }],
      current: [v?.current || false],
      description: [v?.description || '']
    });
  }

  // ─── Add/Remove helpers ───────────────────────────────────────
  addSkill(): void { this.skillsArray.push(this.createSkillGroup()); }
  removeSkill(i: number): void { this.skillsArray.removeAt(i); }

  addExperience(): void { this.experiencesArray.push(this.createExperienceGroup()); }
  removeExperience(i: number): void { this.experiencesArray.removeAt(i); }

  addProject(): void { this.projectsArray.push(this.createProjectGroup()); }
  removeProject(i: number): void { this.projectsArray.removeAt(i); }

  addEducation(): void { this.educationArray.push(this.createEducationGroup()); }
  removeEducation(i: number): void { this.educationArray.removeAt(i); }

  addCertification(): void { this.certificationsArray.push(this.createCertificationGroup()); }
  removeCertification(i: number): void { this.certificationsArray.removeAt(i); }

  addAward(): void { this.awardsArray.push(this.createAwardGroup()); }
  removeAward(i: number): void { this.awardsArray.removeAt(i); }

  addPublication(): void { this.publicationsArray.push(this.createPublicationGroup()); }
  removePublication(i: number): void { this.publicationsArray.removeAt(i); }

  addLanguage(): void { this.languagesArray.push(this.createLanguageGroup()); }
  removeLanguage(i: number): void { this.languagesArray.removeAt(i); }

  addVolunteer(): void { this.volunteerArray.push(this.createVolunteerGroup()); }
  removeVolunteer(i: number): void { this.volunteerArray.removeAt(i); }

  // ─── Current toggle ───────────────────────────────────────────
  onCurrentToggle(group: AbstractControl): void {
    const endDate = group.get('endDate');
    if (group.get('current')?.value) {
      endDate?.disable();
      endDate?.setValue('');
    } else {
      endDate?.enable();
    }
  }

  // ─── Tab switch ───────────────────────────────────────────────
  switchTab(tab: ProfileTab): void {
    this.activeTab.set(tab);
  }

  // ─── Save section ─────────────────────────────────────────────
  async saveSection(section: ProfileTab): Promise<void> {
    const payload = this.buildPayload(section);
    if (!payload) return;

    this.savingSection.set(section);
    try {
      const response = await firstValueFrom(this.profileService.updateFullProfile(payload));
      if (response.success && response.data) {
        this.profile.set(response.data);
        this.toastr.success(`${this.getSectionLabel(section)} saved successfully`, 'Success');
      }
    } catch (error: any) {
      this.toastr.error(error.error?.message || 'Failed to save', 'Error');
    } finally {
      this.savingSection.set(null);
    }
  }

  private buildPayload(section: ProfileTab): Partial<Profile> | null {
    switch (section) {
      case 'personal': {
        if (this.personalInfoForm.invalid) { this.personalInfoForm.markAllAsTouched(); return null; }
        const v = this.personalInfoForm.value;
        return {
          personalInfo: {
            firstName: v.firstName, middleName: v.middleName, lastName: v.lastName,
            email: v.email, phone: v.phone,
            address: { city: v.city, country: v.country },
            linkedin: v.linkedin, github: v.github, portfolio: v.portfolio, website: v.website
          }
        } as any;
      }
      case 'summary': {
        if (this.summaryForm.invalid) { this.summaryForm.markAllAsTouched(); return null; }
        const v = this.summaryForm.value;
        return {
          professionalSummary: {
            summary: v.summary,
            yearsOfExperience: v.yearsOfExperience,
            coreCompetencies: v.coreCompetencies ? v.coreCompetencies.split(',').map((c: string) => c.trim()).filter(Boolean) : [],
            specialization: v.specialization
          }
        } as any;
      }
      case 'skills': {
        if (this.skillsForm.invalid) { this.skillsForm.markAllAsTouched(); return null; }
        return { skills: this.skillsForm.value.skills } as any;
      }
      case 'experience': {
        if (this.experienceForm.invalid) { this.experienceForm.markAllAsTouched(); return null; }
        return {
          workExperience: this.experienceForm.getRawValue().experiences.map((e: any) => ({
            ...e,
            achievements: e.achievements ? e.achievements.split('\n').filter(Boolean) : [],
            technologies: e.technologies ? e.technologies.split(',').map((t: string) => t.trim()).filter(Boolean) : []
          }))
        } as any;
      }
      case 'projects': {
        if (this.projectsForm.invalid) { this.projectsForm.markAllAsTouched(); return null; }
        return {
          projects: this.projectsForm.getRawValue().projects.map((p: any) => ({
            ...p,
            technologies: p.technologies ? p.technologies.split(',').map((t: string) => t.trim()).filter(Boolean) : []
          }))
        } as any;
      }
      case 'education': {
        if (this.educationForm.invalid) { this.educationForm.markAllAsTouched(); return null; }
        return {
          education: this.educationForm.value.education.map((ed: any) => ({
            ...ed,
            achievements: ed.achievements ? ed.achievements.split('\n').filter(Boolean) : []
          }))
        } as any;
      }
      case 'certifications': {
        if (this.certificationsForm.invalid) { this.certificationsForm.markAllAsTouched(); return null; }
        return { certifications: this.certificationsForm.value.certifications } as any;
      }
      case 'additional': {
        if (this.additionalForm.invalid) { this.additionalForm.markAllAsTouched(); return null; }
        const v = this.additionalForm.getRawValue();
        return {
          additionalInfo: {
            awards: v.awards,
            publications: v.publications.map((p: any) => ({
              ...p,
              authors: p.authors ? p.authors.split(',').map((a: string) => a.trim()).filter(Boolean) : []
            })),
            languages: v.languages,
            volunteerExperience: v.volunteerExperience
          }
        } as any;
      }
      default: return null;
    }
  }

  private getSectionLabel(section: ProfileTab): string {
    return this.tabs.find(t => t.key === section)?.label || section;
  }

  // ─── Profile picture ─────────────────────────────────────────
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.toastr.error('File size must be less than 5MB', 'Upload Failed');
      input.value = '';
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.toastr.error('Only JPEG, PNG, GIF, and WebP images are allowed', 'Upload Failed');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => this.picturePreview.set(e.target?.result as string);
    reader.readAsDataURL(file);
    this.uploadPicture(file);
    input.value = '';
  }

  async uploadPicture(file: File): Promise<void> {
    this.uploadingPicture.set(true);
    try {
      const response = await firstValueFrom(this.authService.uploadProfilePicture(file));
      if (response.success) {
        this.toastr.success('Profile picture uploaded', 'Success');
      }
    } catch (error: any) {
      this.toastr.error('Failed to upload profile picture', 'Error');
      this.picturePreview.set(null);
    } finally {
      this.uploadingPicture.set(false);
    }
  }

  async onRemovePicture(): Promise<void> {
    if (!confirm('Remove profile picture?')) return;
    this.uploadingPicture.set(true);
    try {
      await firstValueFrom(this.authService.removeProfilePicture());
      this.picturePreview.set(null);
      this.toastr.success('Profile picture removed', 'Success');
    } catch {
      this.toastr.error('Failed to remove picture', 'Error');
    } finally {
      this.uploadingPicture.set(false);
    }
  }

  // ─── Utilities ────────────────────────────────────────────────
  private toMonthInput(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  formatProficiency(p: string): string {
    return p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  // ─── Resume Upload ──────────────────────────────────────────
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);
  }

  onResumeDropped(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.uploadAndParseResume(file);
    }
  }

  onResumeSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.uploadAndParseResume(file);
    }
    input.value = '';
  }

  async uploadAndParseResume(file: File): Promise<void> {
    if (file.type !== 'application/pdf') {
      this.toastr.error('Only PDF files are supported', 'Invalid File');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toastr.error('File size must be less than 10MB', 'File Too Large');
      return;
    }

    this.parsingResume.set(true);

    try {
      const formData = new FormData();
      formData.append('resume', file);

      const response: any = await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/profile/parse-resume`, formData)
      );

      if (response.success && response.data) {
        this.profile.set(response.data);
        this.initializeForms();
        this.onboardingMode.set(false);
        this.toastr.success('Profile auto-filled from your resume!', 'Success');
      }
    } catch (error: any) {
      this.toastr.error(
        error.error?.message || 'Failed to parse resume. Please try again.',
        'Parsing Failed'
      );
    } finally {
      this.parsingResume.set(false);
    }
  }
}
