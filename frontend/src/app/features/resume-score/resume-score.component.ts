import { Component, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ToastrService } from 'ngx-toastr';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface ScoreCategory {
  name: string;
  score: number;
  maxScore: number;
  icon: string;
  feedback: string;
  tips: string[];
}

interface AnalysisResult {
  overallScore: number;
  categories: ScoreCategory[];
  keywords: { found: string[]; missing: string[] };
  summary: string;
  grade: string;
  gradeColor: string;
}

@Component({
  selector: 'app-resume-score',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './resume-score.component.html',
  styleUrls: ['./resume-score.component.scss']
})
export class ResumeScoreComponent {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  private http = inject(HttpClient);
  private toastr = inject(ToastrService);

  // State
  file = signal<File | null>(null);
  fileName = signal('');
  fileSize = signal('');
  analyzing = signal(false);
  result = signal<AnalysisResult | null>(null);
  dragOver = signal(false);
  jobDescription = signal('');
  activeTab = signal<'upload' | 'results'>('upload');
  animatedScore = signal(0);
  expandedCategory = signal<number | null>(null);

  // Computed
  hasFile = computed(() => !!this.file());
  hasResult = computed(() => !!this.result());
  progress = signal(0);
  progressText = signal('');

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

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.dragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFile(files[0]);
    }
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.handleFile(input.files[0]);
    }
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  private handleFile(file: File): void {
    if (file.type !== 'application/pdf') {
      this.toastr.error('Only PDF files are supported', 'Invalid File');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toastr.error('File size must be less than 10MB', 'File Too Large');
      return;
    }

    this.file.set(file);
    this.fileName.set(file.name);
    this.fileSize.set(this.formatFileSize(file.size));
    this.result.set(null);
  }

  removeFile(): void {
    this.file.set(null);
    this.fileName.set('');
    this.fileSize.set('');
    this.result.set(null);
    this.activeTab.set('upload');
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  async analyzeResume(): Promise<void> {
    const file = this.file();
    if (!file) return;

    this.analyzing.set(true);
    this.progress.set(0);
    this.animatedScore.set(0);
    this.progressText.set('Uploading resume...');

    // Show progress animation while waiting for API
    const progressInterval = setInterval(() => {
      const current = this.progress();
      if (current < 90) {
        const increment = current < 30 ? 8 : current < 60 ? 4 : 2;
        this.progress.set(Math.min(current + increment, 90));
      }
      // Update step text based on progress
      const p = this.progress();
      if (p < 20) this.progressText.set('Uploading resume...');
      else if (p < 40) this.progressText.set('Extracting content...');
      else if (p < 60) this.progressText.set('Analyzing with AI...');
      else if (p < 80) this.progressText.set('Evaluating ATS compatibility...');
      else this.progressText.set('Generating score...');
    }, 500);

    try {
      const formData = new FormData();
      formData.append('resume', file);
      if (this.jobDescription()) {
        formData.append('jobDescription', this.jobDescription());
      }

      const response: any = await firstValueFrom(
        this.http.post(`${environment.apiUrl}/auth/ats-score/analyze`, formData)
      );

      clearInterval(progressInterval);
      this.progress.set(100);
      this.progressText.set('Complete!');

      await this.delay(300);

      if (response.success && response.data) {
        this.result.set(response.data);
        this.activeTab.set('results');
        this.animateScore(response.data.overallScore);
      }
    } catch (error: any) {
      clearInterval(progressInterval);
      this.toastr.error(
        error.error?.message || 'Failed to analyze resume. Please try again.',
        'Analysis Failed'
      );
    } finally {
      this.analyzing.set(false);
    }
  }

  private animateScore(target: number): void {
    let current = 0;
    const step = target / 40;
    const interval = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(interval);
      }
      this.animatedScore.set(Math.round(current));
    }, 25);
  }

  toggleCategory(index: number): void {
    this.expandedCategory.set(
      this.expandedCategory() === index ? null : index
    );
  }

  getScoreColor(score: number): string {
    if (score >= 80) return '#22c55e';
    if (score >= 65) return '#3b82f6';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  }

  getScoreLabel(score: number): string {
    if (score >= 80) return 'Excellent';
    if (score >= 65) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Needs Work';
  }

  resetAnalysis(): void {
    this.removeFile();
    this.jobDescription.set('');
    this.progress.set(0);
    this.progressText.set('');
    this.expandedCategory.set(null);
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
