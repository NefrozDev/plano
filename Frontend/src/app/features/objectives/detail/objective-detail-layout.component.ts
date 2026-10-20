import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ActivatedRoute,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ObjectiveContext } from './objective-context';

interface DetailTab {
  label: string;
  path: string;
  link: string[];
}

@Component({
  selector: 'app-objective-detail-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeaderComponent],
  providers: [ObjectiveContext],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './objective-detail-layout.component.html',
  styleUrl: './objective-detail-layout.component.scss',
})
export class ObjectiveDetailLayoutComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmService);
  private readonly store = inject(ObjectivesStore);
  private readonly context = inject(ObjectiveContext);

  readonly objective = this.context.objective;
  readonly menuOpen = signal(false);
  readonly showTitle = signal(true);
  readonly isOwner = computed(() => this.objective()?.ownerId === this.store.currentUserId());
  readonly tabs = computed<readonly DetailTab[]>(() => {
    const objective = this.objective();
    if (!objective) return [];
    const extra: Record<typeof objective.tracking, Omit<DetailTab, 'link'>[]> = {
      metric: [
        { label: 'Calendrier', path: 'calendar' },
        { label: 'Statistiques', path: 'stats' },
      ],
      steps: [{ label: 'Étapes', path: 'steps' }],
      habit: [{ label: 'Habitude', path: 'habit' }],
    };
    return [{ label: 'Aperçu', path: '' }, ...extra[objective.tracking]].map((tab) => ({
      ...tab,
      link: ['/objectives', objective.id, ...(tab.path ? [tab.path] : [])],
    }));
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.context.id.set(id);
      this.menuOpen.set(false);
      if (this.store.find(id)) this.store.markViewed(id);
    });
  }

  /** The summary tab shows the title in large type, so the header hides its copy. */
  onActivate(component: object): void {
    this.showTitle.set(!('hidesHeaderTitle' in component));
  }

  togglePause(): void {
    const objective = this.objective();
    if (!objective) return;
    this.store.setPaused(objective.id, objective.status !== 'paused');
    this.menuOpen.set(false);
  }

  toggleArchive(): void {
    const objective = this.objective();
    if (!objective) return;
    this.store.update(objective.id, { archived: !objective.archived });
    this.menuOpen.set(false);
  }

  async remove(): Promise<void> {
    const objective = this.objective();
    if (!objective) return;
    this.menuOpen.set(false);
    const confirmed = await this.confirm.ask({
      heading: 'Supprimer l’objectif ?',
      message: `« ${objective.title} » sera supprimé définitivement.`,
      confirmLabel: 'Supprimer',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.store.remove(objective.id);
    void this.router.navigateByUrl('/objectives');
  }
}
