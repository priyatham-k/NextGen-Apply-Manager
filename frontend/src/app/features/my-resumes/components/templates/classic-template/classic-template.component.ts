import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplateData } from '../../../models';

@Component({
  selector: 'app-classic-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './classic-template.component.html',
  styleUrls: ['./classic-template.component.scss']
})
export class ClassicTemplateComponent {
  data = input.required<ResumeTemplateData>();

  toBullets(description: string): string[] {
    return description
      .split('\n')
      .map(line => line.replace(/^[•\-]\s*/, '').trim())
      .filter(line => line.length > 0);
  }
}
