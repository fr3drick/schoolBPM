import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-my-requests',
  imports: [RouterLink, MatButtonModule, MatIconModule, InstanceListComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>My requests</h1>
        <span class="spacer"></span>
        <button mat-flat-button color="primary" routerLink="/start">
          <mat-icon>add</mat-icon> Start a request
        </button>
      </div>
      <app-instance-list [instances]="instances()" emptyMessage="You haven't started any requests yet" />
    </div>
  `,
})
export class MyRequestsComponent {
  private api = inject(ApiService);
  instances = signal<ProcessInstance[]>([]);

  constructor() {
    this.api.myRequests().subscribe((res) => this.instances.set(res.instances));
  }
}
