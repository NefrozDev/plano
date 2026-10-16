import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly document = inject(DOCUMENT);

  /**
   * Resolves to false instead of throwing when the clipboard is unavailable
   * (insecure context, denied permission, server rendering), so callers can
   * fall back to showing the text.
   */
  async copy(text: string): Promise<boolean> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard) return false;
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}
