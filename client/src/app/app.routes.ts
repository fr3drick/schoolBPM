import { Routes } from '@angular/router';
import { authGuard, permGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent) },
  {
    path: 'change-password',
    canActivate: [authGuard],
    loadComponent: () => import('./features/change-password/change-password').then((m) => m.ChangePasswordComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.DashboardComponent) },
      {
        path: 'start',
        canActivate: [permGuard],
        data: { perms: ['instances.initiate'] },
        loadComponent: () => import('./features/catalog/catalog').then((m) => m.CatalogComponent),
      },
      {
        path: 'start/:id',
        canActivate: [permGuard],
        data: { perms: ['instances.initiate'] },
        loadComponent: () => import('./features/request-form/request-form').then((m) => m.RequestFormComponent),
      },
      { path: 'requests', loadComponent: () => import('./features/my-requests/my-requests').then((m) => m.MyRequestsComponent) },
      { path: 'requests/:id', loadComponent: () => import('./features/instance-detail/instance-detail').then((m) => m.InstanceDetailComponent) },
      { path: 'requests/:id/edit', loadComponent: () => import('./features/request-form/request-form').then((m) => m.RequestFormComponent) },
      {
        path: 'approvals',
        canActivate: [permGuard],
        data: { perms: ['instances.act'] },
        loadComponent: () => import('./features/approvals/approvals').then((m) => m.ApprovalsComponent),
      },
      {
        path: 'all',
        canActivate: [permGuard],
        data: { perms: ['instances.view_all'] },
        loadComponent: () => import('./features/all-requests/all-requests').then((m) => m.AllRequestsComponent),
      },
      {
        path: 'admin/users',
        canActivate: [permGuard],
        data: { perms: ['users.manage'] },
        loadComponent: () => import('./features/admin/users/users').then((m) => m.UsersComponent),
      },
      {
        path: 'admin/roles',
        canActivate: [permGuard],
        data: { perms: ['roles.manage'] },
        loadComponent: () => import('./features/admin/roles/roles').then((m) => m.RolesComponent),
      },
      {
        path: 'admin/processes',
        canActivate: [permGuard],
        data: { perms: ['definitions.manage'] },
        loadComponent: () => import('./features/admin/designer/designer-list').then((m) => m.DesignerListComponent),
      },
      {
        path: 'admin/processes/new',
        canActivate: [permGuard],
        data: { perms: ['definitions.manage'] },
        loadComponent: () => import('./features/admin/designer/designer-edit').then((m) => m.DesignerEditComponent),
      },
      {
        path: 'admin/processes/:id',
        canActivate: [permGuard],
        data: { perms: ['definitions.manage'] },
        loadComponent: () => import('./features/admin/designer/designer-edit').then((m) => m.DesignerEditComponent),
      },
      {
        path: 'audit',
        canActivate: [permGuard],
        data: { perms: ['audit.view'] },
        loadComponent: () => import('./features/audit/audit').then((m) => m.AuditComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
