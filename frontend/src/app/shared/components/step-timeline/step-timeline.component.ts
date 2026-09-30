import { Component, input } from '@angular/core';
import { DatePipe } from '@angular/common';

export type StepLevel = 'info' | 'success' | 'warn' | 'error';

export interface TimelineStep {
  at: string | Date;
  message: string;
  level?: StepLevel;
}

/** Vertical list of automation steps with a time and a status icon per step */
@Component({
  selector: 'app-step-timeline',
  standalone: true,
  imports: [DatePipe],
  template: `
    @if (steps().length === 0) {
      <p class="timeline-empty">{{ emptyText() }}</p>
    } @else {
      <ol class="timeline">
        @for (step of steps(); track $index) {
          <li class="timeline-step" [class]="'level-' + (step.level || 'info')">
            <i class="bi" [class]="icon(step.level)"></i>
            <span class="timeline-time">{{ step.at | date: 'h:mm:ss a' }}</span>
            <span class="timeline-message">{{ step.message }}</span>
          </li>
        }
        @if (inProgress()) {
          <li class="timeline-step level-running">
            <span class="spinner-border spinner-border-sm"></span>
            <span class="timeline-time"></span>
            <span class="timeline-message">Working…</span>
          </li>
        }
      </ol>
    }
  `,
  styles: [`
    .timeline { list-style: none; margin: 0; padding: 0; }
    .timeline-step {
      display: grid;
      grid-template-columns: 1.25rem 5.5rem 1fr;
      gap: 0.5rem;
      align-items: start;
      padding: 0.3rem 0;
      font-size: 0.8125rem;
      border-bottom: 1px dashed #eef2f6;
    }
    .timeline-step:last-child { border-bottom: 0; }
    .timeline-time { color: #94a3b8; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .timeline-message { color: #334155; word-break: break-word; }
    .level-info .bi { color: #64748b; }
    .level-success .bi { color: #16a34a; }
    .level-warn .bi { color: #d97706; }
    .level-warn .timeline-message { color: #92400e; }
    .level-error .bi { color: #dc2626; }
    .level-error .timeline-message { color: #991b1b; }
    .level-running { color: #2563eb; }
    .timeline-empty { color: #94a3b8; font-size: 0.8125rem; margin: 0; }
    @media (max-width: 576px) {
      .timeline-step { grid-template-columns: 1.25rem 1fr; }
      .timeline-time { display: none; }
    }
  `]
})
export class StepTimelineComponent {
  steps = input<TimelineStep[]>([]);
  inProgress = input(false);
  emptyText = input('No steps yet');

  icon(level?: StepLevel): string {
    switch (level) {
      case 'success': return 'bi-check-circle-fill';
      case 'warn': return 'bi-exclamation-triangle-fill';
      case 'error': return 'bi-x-circle-fill';
      default: return 'bi-dot';
    }
  }
}
