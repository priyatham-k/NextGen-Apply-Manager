import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-resume-form-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './resume-form-editor.component.html',
  styleUrls: ['./resume-form-editor.component.scss']
})
export class ResumeFormEditorComponent {
  resumeForm = input.required<FormGroup>();
  loading = input<boolean>(false);

  save = output<void>();
  addExperience = output<void>();
  removeExperience = output<number>();
  addEducation = output<void>();
  removeEducation = output<number>();

  get experiences(): FormArray {
    return this.resumeForm().get('experiences') as FormArray;
  }

  get education(): FormArray {
    return this.resumeForm().get('education') as FormArray;
  }
}
