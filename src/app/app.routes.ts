import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: ':pageCode', loadComponent: () => import('./app').then(m => m.App) },
  { path: '', loadComponent: () => import('./app').then(m => m.App) },
];
