import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplateData } from '../../../models';

@Component({
  selector: 'app-professional-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './professional-template.component.html',
  styleUrls: ['./professional-template.component.scss']
})
export class ProfessionalTemplateComponent {
  data = input.required<ResumeTemplateData>();
}
