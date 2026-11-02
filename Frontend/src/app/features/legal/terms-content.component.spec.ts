import { TestBed } from '@angular/core/testing';
import { TermsContentComponent } from './terms-content.component';

describe('TermsContentComponent', () => {
  let element: HTMLElement;

  beforeEach(() => {
    const fixture = TestBed.createComponent(TermsContentComponent);
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  it('numbers its sections, the privacy policy reachable by its anchor', () => {
    const headings = Array.from(element.querySelectorAll('h3'), (heading) => heading.textContent);

    expect(headings).toHaveLength(10);
    expect(headings.every((heading, index) => heading?.startsWith(`${index + 1}. `))).toBe(true);
    expect(element.querySelector('#terms-privacy h3')?.textContent).toContain('confidentialité');
  });

  it('names the publisher, the contact address, Belgian law and the Belgian authority', () => {
    const text = element.textContent ?? '';

    expect(text).toContain('Synapse Engineering');
    expect(element.querySelector('a[href="mailto:contact@synapseengineering.dev"]')?.textContent).toBe(
      'contact@synapseengineering.dev',
    );
    expect(text).toContain('droit belge');
    expect(text).toContain('Autorité de protection des données');
  });

  it('opens the authority’s site in a new tab without giving it access to the app', () => {
    const link = element.querySelector('a[href="https://www.autoriteprotectiondonnees.be"]') as HTMLAnchorElement;

    expect(link.target).toBe('_blank');
    expect(link.rel).toContain('noopener');
  });

  it('states the durations the app actually uses', () => {
    const text = element.textContent ?? '';

    // Same as SESSION_TTL_DAYS in production and the reset link lifetime (AGENTS.md).
    expect(text).toContain('pendant 30 jours au plus');
    expect(text).toContain('valables 30 minutes');
  });
});
