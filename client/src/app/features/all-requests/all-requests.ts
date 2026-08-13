import { Component, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { ApiService } from '../../core/api.service';
import { ProcessInstance } from '../../core/models';
import { InstanceListComponent } from '../../shared/instance-list';

@Component({
  selector: 'app-all-requests',
  imports: [MatButtonToggleModule, InstanceListComponent],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>All requests</h1>
        <span class="spacer"></span>
        <mat-button-toggle-group [value]="status()" (change)="setStatus($event.value)" hideSingleSelectionIndicator>
          <mat-button-toggle value="">All</mat-button-toggle>
          <mat-button-toggle value="in_progress">In progress</mat-button-toggle>
          <mat-button-toggle value="approved">Approved</mat-button-toggle>
          <mat-button-toggle value="rejected">Rejected</mat-button-toggle>
          <mat-button-toggle value="returned">Returned</mat-button-toggle>
        </mat-button-toggle-group>
      </div>
      <app-instance-list [instances]="instances()" [showInitiator]="true" emptyMessage="No requests match" />
    </div>
  `,
})
export class AllRequestsComponent {
  private api = inject(ApiService);
  instances = signal<ProcessInstance[]>([]);
  status = signal('');

  constructor() {
    this.load();
  }

  setStatus(value: string) {
    this.status.set(value);
    this.load();
  }

  private load() {
    this.api.allRequests(this.status() || undefined).subscribe((res) => this.instances.set(res.instances));
  }
}
