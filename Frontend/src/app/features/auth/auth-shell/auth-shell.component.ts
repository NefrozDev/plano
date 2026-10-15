import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
})
export class AuthShellComponent {
  @Input() compact = false;
  /** Accessible label of the top-left back bubble; the bubble is hidden when empty. */
  @Input() backLabel = '';
  @Output() readonly back = new EventEmitter<void>();
}
