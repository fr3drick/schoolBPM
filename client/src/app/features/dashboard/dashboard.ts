import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { DashboardStats } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, InstanceListComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Welcome, {{ firstName() }}</h1>
        <span class="spacer"></span>
        @if (auth.hasPerm('instances.initiate')) {
          <button mat-flat-button color="primary" routerLink="/start">
            <mat-icon>add</mat-icon> Start a request
          </button>
        }
      </div>

      @if (stats(); as s) {
        <div class="cards">
          @if (auth.hasPerm('instances.act')) {
            <mat-card class="stat" routerLink="/approvals">
              <div class="num accent">{{ s.myTasks }}</div>
              <div class="label">Awaiting my action</div>
            </mat-card>
          }
          <mat-card class="stat" routerLink="/requests">
            <div class="num">{{ s.myOpen }}</div>
            <div class="label">My open requests</div>
          </mat-card>
          @if (s.totals; as t) {
            <mat-card class="stat" routerLink="/all">
              <div class="num">{{ t.in_progress }}</div>
              <div class="label">In progress school-wide</div>
            </mat-card>
            <mat-card class="stat" routerLink="/all">
              <div class="num green">{{ t.approved }}</div>
              <div class="label">Approved school-wide</div>
            </mat-card>
          }
        </div>

        @if (auth.hasPerm('instances.initiate')) {
          <h2>My recent requests</h2>
          <app-instance-list [instances]="s.recentMine" emptyMessage="You haven't started any requests yet" />
        }
      }
    </div>
  `,
  styles: `
    .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 28px; }
    .stat { padding: 20px; cursor: pointer; transition: box-shadow .15s; }
    .stat:hover { box-shadow: 0 3px 10px rgba(0,0,0,.15); }
    .num { font-size: 34px; font-weight: 600; }
    .num.accent { color: #1565c0; }
    .num.green { color: #2e7d32; }
    .label { color: #78909c; font-size: 13px; margin-top: 2px; }
    h2 { font-size: 17px; font-weight: 500; margin: 0 0 12px; }
  `,
})
export class DashboardComponent {
  readonly auth = inject(AuthService);
  private api = inject(ApiService);
  stats = signal<DashboardStats | null>(null);

  constructor() {
    this.api.stats().subscribe((s) => this.stats.set(s));
  }

  firstName(): string {
    return this.auth.user()?.name.split(' ')[0] ?? '';
  }
}
