import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplateData } from '../../../models';

@Component({
  selector: 'app-modern-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './modern-template.component.html',
  styleUrls: ['./modern-template.component.scss']
})
export class ModernTemplateComponent {
  data = input.required<ResumeTemplateData>();

  toBullets(description: string): string[] {
    return description
      .split('\n')
      .map(line => line.replace(/^[•\-]\s*/, '').trim())
      .filter(line => line.length > 0);
  }
}
