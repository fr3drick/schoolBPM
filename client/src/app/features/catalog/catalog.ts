import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ApiService } from '../../core/api.service';
import { ProcessDefinition } from '../../core/models';

@Component({
  selector: 'app-catalog',
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>Start a request</h1>
      </div>
      @if (definitions().length === 0 && loaded()) {
        <div class="empty-state">
          <mat-icon>category</mat-icon>
          <div>No processes are available for your role yet.</div>
        </div>
      }
      <div class="grid">
        @for (d of definitions(); track d._id) {
          <mat-card class="proc">
            <div class="cat">{{ d.category }}</div>
            <h2>{{ d.name }}</h2>
            <p class="muted">{{ d.description }}</p>
            <div class="meta">
              <mat-icon inline>route</mat-icon>
              {{ d.steps.length }} approval step{{ d.steps.length === 1 ? '' : 's' }}
            </div>
            <div class="actions">
              <button mat-flat-button color="primary" [routerLink]="['/start', d._id]">Start</button>
            </div>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
    .proc { padding: 20px; display: flex; flex-direction: column; }
    .cat { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .8px; color: #1565c0; }
    h2 { font-size: 17px; margin: 6px 0; }
    p { flex: 1; font-size: 13px; line-height: 1.45; margin: 0 0 10px; }
    .meta { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #78909c; margin-bottom: 12px; }
    .actions { display: flex; justify-content: flex-end; }
  `,
})
export class CatalogComponent {
  private api = inject(ApiService);
  definitions = signal<ProcessDefinition[]>([]);
  loaded = signal(false);

  constructor() {
    this.api.definitions().subscribe((res) => {
      this.definitions.set(res.definitions);
      this.loaded.set(true);
    });
  }
}
