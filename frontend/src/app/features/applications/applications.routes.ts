import { Routes } from '@angular/router';

export const APPLICATIONS_ROUTES: Routes = [
  { 
    path: '', 
    loadComponent: () => import('./application-list/application-list.component').then(m => m.ApplicationListComponent) 
  },
  { 
    path: ':id', 
    loadComponent: () => import('./application-detail/application-detail.component').then(m => m.ApplicationDetailComponent) 
  }
];
