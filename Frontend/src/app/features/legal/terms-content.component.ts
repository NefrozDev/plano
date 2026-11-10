import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { formatLongDate } from '../../core/time/dates';

/** Shown on the terms; change it with any change to the `terms` texts. */
export const TERMS_UPDATED_ON = '2026-11-08';

/**
 * Plano's terms of use and privacy notice (`terms` texts), shown on their own
 * page and linked from the welcome screen. Facts they state (30-day sessions,
 * 10-minute sign-in cookie, no third-party trackers, hosting) must stay true
 * when the app changes, in every language.
 */
@Component({
  selector: 'app-terms-content',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="updated">{{ 'terms.updated' | transloco: { date: updatedOn() } }}</p>
    <p class="updated">{{ 'terms.translations' | transloco }}</p>

    <section>
      <h3>{{ 'terms.purpose.title' | transloco }}</h3>
      <p>{{ 'terms.purpose.body' | transloco }}</p>
      <p>
        {{ 'terms.purpose.contact' | transloco }}
        <a href="mailto:contact@synapseengineering.dev">contact&#64;synapseengineering.dev</a>
      </p>
    </section>

    <section>
      <h3>{{ 'terms.account.title' | transloco }}</h3>
      <ul>
        @for (item of accountItems; track item) {
          <li>{{ 'terms.account.' + item | transloco }}</li>
        }
      </ul>
    </section>

    <section>
      <h3>{{ 'terms.conduct.title' | transloco }}</h3>
      <p>{{ 'terms.conduct.intro' | transloco }}</p>
      <ul>
        @for (item of conductItems; track item) {
          <li>{{ 'terms.conduct.' + item | transloco }}</li>
        }
      </ul>
    </section>

    <section>
      <h3>{{ 'terms.content.title' | transloco }}</h3>
      <p>{{ 'terms.content.ownership' | transloco }}</p>
      <p>{{ 'terms.content.sharing' | transloco }}</p>
    </section>

    <section>
      <h3>{{ 'terms.service.title' | transloco }}</h3>
      <p>{{ 'terms.service.body' | transloco }}</p>
    </section>

    <section>
      <h3>{{ 'terms.deletion.title' | transloco }}</h3>
      <p>{{ 'terms.deletion.body' | transloco }}</p>
    </section>

    <section>
      <h3>{{ 'terms.liability.title' | transloco }}</h3>
      <p>{{ 'terms.liability.body' | transloco }}</p>
    </section>

    <section id="terms-privacy">
      <h3>{{ 'terms.privacy.title' | transloco }}</h3>
      <p>{{ 'terms.privacy.controller' | transloco }}</p>
      <h4>{{ 'terms.privacy.keptTitle' | transloco }}</h4>
      <ul>
        @for (item of keptItems; track item) {
          <li>{{ 'terms.privacy.' + item | transloco }}</li>
        }
      </ul>
      <h4>{{ 'terms.privacy.whyTitle' | transloco }}</h4>
      <p>{{ 'terms.privacy.why' | transloco }}</p>
      <h4>{{ 'terms.privacy.cookiesTitle' | transloco }}</h4>
      <p>{{ 'terms.privacy.cookies' | transloco }}</p>
      <h4>{{ 'terms.privacy.whereTitle' | transloco }}</h4>
      <p>{{ 'terms.privacy.where' | transloco }}</p>
      <h4>{{ 'terms.privacy.rightsTitle' | transloco }}</h4>
      <p>
        {{ 'terms.privacy.rights' | transloco }}
        (<a href="https://www.autoriteprotectiondonnees.be" target="_blank" rel="noopener">autoriteprotectiondonnees.be</a>).
      </p>
    </section>

    <section>
      <h3>{{ 'terms.changes.title' | transloco }}</h3>
      <p>{{ 'terms.changes.body' | transloco }}</p>
    </section>

    <section>
      <h3>{{ 'terms.law.title' | transloco }}</h3>
      <p>{{ 'terms.law.body' | transloco }}</p>
    </section>
  `,
  styles: `
    :host { display: block; color: var(--color-text); font-size: .8rem; line-height: 1.5; }
    .updated { margin: 0 0 1rem; color: var(--color-text-muted); font-size: .72rem; }
    .updated + .updated { margin-top: -.75rem; }
    section + section { margin-top: 1.1rem; }
    h3 { margin: 0 0 .35rem; font-size: .88rem; letter-spacing: -.01em; }
    h4 { margin: .7rem 0 .2rem; font-size: .8rem; }
    p { margin: 0 0 .45rem; }
    ul { margin: 0 0 .45rem; padding-left: 1.1rem; }
    li + li { margin-top: .2rem; }
    a { color: var(--color-primary); font-weight: 600; }
  `,
})
export class TermsContentComponent {
  readonly accountItems = ['synapse', 'age', 'accurate', 'password', 'single'];
  readonly conductItems = ['illegal', 'impersonate', 'spam', 'access', 'disrupt'];
  readonly keptItems = ['identity', 'photo', 'content', 'ip'];

  /** In the interface language, so it reads like the rest of the page. */
  updatedOn(): string {
    return formatLongDate(TERMS_UPDATED_ON);
  }
}
