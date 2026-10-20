import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

@Component({
  selector: 'app-auth-shell',
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {
  readonly compact = input(false);
  /** Accessible label of the top-left back bubble; the bubble is hidden when empty. */
  readonly backLabel = input('');
  readonly back = output<void>();
}
