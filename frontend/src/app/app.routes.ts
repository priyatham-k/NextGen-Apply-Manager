import { Routes } from '@angular/router';
import { LayoutComponent } from './core/layout';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  {
    path: '',
    component: LayoutComponent,
    children: [
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
      },
      {
        path: 'jobs',
        loadChildren: () => import('./features/jobs/jobs.routes').then(m => m.JOBS_ROUTES)
      },
      {
        path: 'applications',
        loadChildren: () => import('./features/applications/applications.routes').then(m => m.APPLICATIONS_ROUTES)
      },
      {
        path: 'analytics',
        loadChildren: () => import('./features/analytics/analytics.routes').then(m => m.ANALYTICS_ROUTES)
      },
      {
        path: 'resume-builder',
        loadChildren: () => import('./features/resume-builder/resume-builder.routes').then(m => m.RESUME_BUILDER_ROUTES)
      },
      {
        path: 'resume-score',
        loadChildren: () => import('./features/resume-score/resume-score.routes').then(m => m.RESUME_SCORE_ROUTES)
      },
      {
        path: 'top-matches',
        loadChildren: () => import('./features/top-matches/top-matches.routes').then(m => m.TOP_MATCHES_ROUTES)
      },
      {
        path: 'my-resumes',
        loadChildren: () => import('./features/my-resumes/my-resumes.routes').then(m => m.MY_RESUMES_ROUTES)
      },
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes').then(m => m.PROFILE_ROUTES)
      },
      {
        path: '',
        redirectTo: '/dashboard',
        pathMatch: 'full'
      }
    ]
  },
  {
    path: '**',
    redirectTo: '/dashboard'
  }
];
