import { Routes } from '@angular/router';
import { authGuard, awaitingReviewGuard, moduleGuard, permGuard, platformGuard } from './core/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.LoginComponent) },
  {
    path: 'signup',
    loadComponent: () => import('./features/signup/signup').then((m) => m.SignupComponent),
  },
  {
    path: 'pending-approval',
    canActivate: [authGuard, awaitingReviewGuard],
    loadComponent: () =>
      import('./features/pending-approval/pending-approval').then((m) => m.PendingApprovalComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password/:token',
    loadComponent: () => import('./features/reset-password/reset-password').then((m) => m.ResetPasswordComponent),
  },
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
        path: 'platform/schools',
        canActivate: [platformGuard],
        loadComponent: () => import('./features/platform/schools').then((m) => m.SchoolsComponent),
      },
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
        path: 'admin/emails',
        canActivate: [permGuard],
        data: { perms: ['email.view'] },
        loadComponent: () => import('./features/admin/emails/emails').then((m) => m.EmailsComponent),
      },
      {
        path: 'students',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'students', perms: ['students.view', 'students.manage'] },
        loadComponent: () => import('./features/students/students').then((m) => m.StudentsComponent),
      },
      {
        path: 'classes',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'students', perms: ['classes.manage', 'students.view'] },
        loadComponent: () => import('./features/classes/classes').then((m) => m.ClassesComponent),
      },
      {
        path: 'subjects',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'students', perms: ['subjects.manage', 'students.view'] },
        loadComponent: () => import('./features/subjects/subjects').then((m) => m.SubjectsComponent),
      },
      {
        path: 'exams',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'exams', perms: ['exams.manage', 'results.enter', 'results.view'] },
        loadComponent: () => import('./features/exams/exams').then((m) => m.ExamsComponent),
      },
      {
        path: 'exams/:id',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'exams', perms: ['exams.manage', 'results.enter', 'results.view'] },
        loadComponent: () => import('./features/exams/exam-results').then((m) => m.ExamResultsComponent),
      },
      {
        path: 'attendance',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'attendance', perms: ['attendance.take', 'attendance.view'] },
        loadComponent: () => import('./features/attendance/attendance').then((m) => m.AttendanceComponent),
      },
      {
        path: 'reports',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'reports', perms: ['reports.issue', 'reports.view'] },
        loadComponent: () => import('./features/reports/reports').then((m) => m.ReportsComponent),
      },
      {
        path: 'communications',
        canActivate: [moduleGuard, permGuard],
        data: { module: 'communications', perms: ['comms.send', 'comms.view'] },
        loadComponent: () => import('./features/communications/communications').then((m) => m.CommunicationsComponent),
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
