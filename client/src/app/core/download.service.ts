import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Fetches an authenticated file and hands it to the browser.
 *
 * A plain <a href> or window.open cannot be used for these: the JWT lives in
 * the HTTP interceptor, so a direct navigation arrives unauthenticated. The
 * file is fetched through HttpClient (picking up the Authorization header),
 * then turned into a blob URL for saving or printing.
 */
@Injectable({ providedIn: 'root' })
export class DownloadService {
  private http = inject(HttpClient);

  private fetchBlob(url: string): Promise<Blob> {
    return firstValueFrom(this.http.get(url, { responseType: 'blob' }));
  }

  /** Saves the file under `filename`. */
  async save(url: string, filename: string): Promise<void> {
    const blob = await this.fetchBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoked on a delay: Safari aborts the download if the URL dies too soon.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }

  /**
   * Opens the browser's print dialog for the file, so printed output is the
   * same document as the download rather than a separately styled page.
   *
   * Uses a hidden iframe; if a browser blocks printing from one, the file is
   * opened in a new tab so the user can print from the built-in viewer.
   */
  async print(url: string): Promise<void> {
    const blob = await this.fetchBlob(url);
    const objectUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.src = objectUrl;

    const cleanup = () => {
      setTimeout(() => {
        iframe.remove();
        URL.revokeObjectURL(objectUrl);
      }, 60_000);
    };

    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {
        window.open(objectUrl, '_blank');
      }
      cleanup();
    };
    iframe.onerror = () => {
      window.open(objectUrl, '_blank');
      cleanup();
    };

    document.body.appendChild(iframe);
  }
}

/**
 * Copies text to the clipboard.
 * The async Clipboard API needs a secure context, so plain-HTTP deployments
 * fall back to a hidden textarea and execCommand.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
