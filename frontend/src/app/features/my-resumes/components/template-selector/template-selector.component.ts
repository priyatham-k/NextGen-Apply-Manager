import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplate, TEMPLATE_OPTIONS } from '../../models';

@Component({
  selector: 'app-template-selector',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-selector.component.html',
  styleUrls: ['./template-selector.component.scss']
})
export class TemplateSelectorComponent {
  selectedTemplate = input.required<ResumeTemplate>();
  templateChange = output<ResumeTemplate>();

  templates = TEMPLATE_OPTIONS;

  selectTemplate(template: ResumeTemplate): void {
    this.templateChange.emit(template);
  }
}
