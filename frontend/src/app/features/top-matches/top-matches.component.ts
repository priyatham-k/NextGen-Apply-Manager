import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-top-matches',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="coming-soon-container">
      <div class="coming-soon-card">
        <div class="icon-wrapper">
          <div class="icon-circle">
            <i class="bi bi-stars"></i>
          </div>
          <div class="pulse-ring"></div>
          <div class="pulse-ring delay"></div>
        </div>

        <h1 class="title">Top Matches</h1>
        <p class="subtitle">AI-powered job matching tailored to your skills and experience</p>

        <div class="features-grid">
          <div class="feature-item">
            <div class="feature-icon purple"><i class="bi bi-cpu"></i></div>
            <div class="feature-text">
              <span class="feature-title">AI Matching</span>
              <span class="feature-desc">Smart resume-to-job scoring</span>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon blue"><i class="bi bi-sort-down-alt"></i></div>
            <div class="feature-text">
              <span class="feature-title">Ranked Results</span>
              <span class="feature-desc">Best matches shown first</span>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon green"><i class="bi bi-check2-circle"></i></div>
            <div class="feature-text">
              <span class="feature-title">Skill Gap Analysis</span>
              <span class="feature-desc">See what you need to improve</span>
            </div>
          </div>
          <div class="feature-item">
            <div class="feature-icon amber"><i class="bi bi-bell"></i></div>
            <div class="feature-text">
              <span class="feature-title">Match Alerts</span>
              <span class="feature-desc">Get notified for high matches</span>
            </div>
          </div>
        </div>

        <div class="badge-coming-soon">
          <i class="bi bi-rocket-takeoff me-2"></i>Coming Soon
        </div>

        <p class="cta-text">Browse available jobs while we build this feature</p>
        <a routerLink="/jobs" class="btn-browse">
          <i class="bi bi-briefcase me-2"></i>View All Jobs
        </a>
      </div>
    </div>
  `,
  styles: [`
    @import 'assets/styles/variables';

    .coming-soon-container {
      padding: 2rem 1rem;
      max-width: 700px;
      margin: 0 auto;
      animation: fadeIn 0.4s ease-out;
    }

    .coming-soon-card {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: $border-radius-xl;
      padding: 3rem 2rem;
      text-align: center;
    }

    .icon-wrapper {
      position: relative;
      width: 80px;
      height: 80px;
      margin: 0 auto 1.5rem;
    }

    .icon-circle {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #8b5cf6, #6d28d9);
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      z-index: 1;

      i {
        font-size: 2rem;
        color: #fff;
      }
    }

    .pulse-ring {
      position: absolute;
      inset: -8px;
      border-radius: 50%;
      border: 2px solid rgba(#8b5cf6, 0.25);
      animation: pulse 2.5s ease-out infinite;

      &.delay { animation-delay: 1.25s; }
    }

    .title {
      font-size: 1.75rem;
      font-weight: 700;
      color: $dark-base;
      margin-bottom: 0.5rem;
      letter-spacing: -0.02em;
    }

    .subtitle {
      color: $muted;
      font-size: $font-size-sm;
      margin-bottom: 2rem;
    }

    .features-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.75rem;
      margin-bottom: 2rem;
      text-align: left;
    }

    .feature-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.875rem;
      background: $background;
      border-radius: $border-radius;
      transition: all 0.15s ease;

      &:hover { background: darken($background, 2%); }
    }

    .feature-icon {
      width: 36px;
      height: 36px;
      border-radius: $border-radius;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1rem;
      flex-shrink: 0;

      &.blue { background: rgba($primary, 0.1); color: $primary; }
      &.green { background: rgba($accent, 0.1); color: darken($accent, 5%); }
      &.purple { background: rgba(#8b5cf6, 0.1); color: #7c3aed; }
      &.amber { background: rgba($warning, 0.1); color: darken($warning, 5%); }
    }

    .feature-text {
      display: flex;
      flex-direction: column;
    }

    .feature-title {
      font-size: $font-size-xs;
      font-weight: 600;
      color: $dark-base;
    }

    .feature-desc {
      font-size: 0.688rem;
      color: $muted;
    }

    .badge-coming-soon {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 1.25rem;
      background: linear-gradient(135deg, rgba(#8b5cf6, 0.1), rgba($primary, 0.1));
      border-radius: 9999px;
      font-size: $font-size-sm;
      font-weight: 600;
      color: #7c3aed;
      margin-bottom: 1.25rem;
    }

    .cta-text {
      color: $muted;
      font-size: $font-size-xs;
      margin-bottom: 0.75rem;
    }

    .btn-browse {
      display: inline-flex;
      align-items: center;
      padding: 0.5rem 1.25rem;
      background: #7c3aed;
      border: none;
      border-radius: $border-radius;
      color: #fff;
      font-size: $font-size-sm;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;

      &:hover {
        background: darken(#7c3aed, 8%);
        color: #fff;
        transform: translateY(-1px);
        box-shadow: 0 4px 12px rgba(#7c3aed, 0.3);
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes pulse {
      0% { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    @media (max-width: 576px) {
      .coming-soon-card { padding: 2rem 1.25rem; }
      .features-grid { grid-template-columns: 1fr; }
      .title { font-size: 1.5rem; }
    }
  `]
})
export class TopMatchesComponent {}
