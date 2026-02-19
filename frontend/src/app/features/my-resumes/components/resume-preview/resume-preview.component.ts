import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplate, ResumeTemplateData } from '../../models';
import { ClassicTemplateComponent } from '../templates/classic-template/classic-template.component';
import { ModernTemplateComponent } from '../templates/modern-template/modern-template.component';
import { MinimalTemplateComponent } from '../templates/minimal-template/minimal-template.component';
import { ProfessionalTemplateComponent } from '../templates/professional-template/professional-template.component';

@Component({
  selector: 'app-resume-preview',
  standalone: true,
  imports: [
    CommonModule,
    ClassicTemplateComponent,
    ModernTemplateComponent,
    MinimalTemplateComponent,
    ProfessionalTemplateComponent
  ],
  templateUrl: './resume-preview.component.html',
  styleUrls: ['./resume-preview.component.scss']
})
export class ResumePreviewComponent {
  data = input.required<ResumeTemplateData>();
  template = input.required<ResumeTemplate>();
  fullPreview = input(false);
}
