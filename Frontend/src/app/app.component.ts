import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  readonly title = 'Plano';
  readonly navigation = ['Today', 'Plan', 'Progress', 'Profile'] as const;
  activeNavigation: (typeof this.navigation)[number] = 'Today';

  selectNavigation(item: (typeof this.navigation)[number]): void {
    this.activeNavigation = item;
  }
}
