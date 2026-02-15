import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ResumeTemplateData } from '../../../models';

@Component({
  selector: 'app-minimal-template',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './minimal-template.component.html',
  styleUrls: ['./minimal-template.component.scss']
})
export class MinimalTemplateComponent {
  data = input.required<ResumeTemplateData>();
}
