import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { ObjectivesStore } from '../objectives.store';
import { provideObjectivesTesting } from '../objectives.testing';
import { ObjectiveShareComponent } from './objective-share.component';

describe('ObjectiveShareComponent', () => {
  let fixture: ComponentFixture<ObjectiveShareComponent>;
  let component: ObjectiveShareComponent;
  let element: HTMLElement;
  let store: ObjectivesStore;

  function setUp(id?: string): void {
    TestBed.configureTestingModule({
      imports: [ObjectiveShareComponent],
      providers: [
        ...provideObjectivesTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap(id ? { id } : {}) } } },
      ],
    });
    fixture = TestBed.createComponent(ObjectiveShareComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement as HTMLElement;
    store = TestBed.inject(ObjectivesStore);
    fixture.detectChanges();
  }

  describe('as the owner', () => {
    beforeEach(() => setUp('courir-10-km'));

    it('pre-selects the people the objective is already shared with', () => {
      expect(element.querySelector('.summary strong')?.textContent).toBe('Courir 10 km');
      // Everyone except the owner can be picked; all six are already selected.
      expect(element.querySelectorAll('.people li').length).toBe(6);
      expect(element.querySelectorAll('.people input:checked').length).toBe(6);
      expect(element.querySelector('.link span')?.textContent).toBe('plano.app/objectif/courir-10-km-a1b2c3');
    });

    it('saves the new selection and returns to the objective', () => {
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      element.querySelectorAll<HTMLInputElement>('.people input')[1].click();
      component.toggle('camille');
      (element.querySelector('.primary-button') as HTMLButtonElement).click();

      expect(store.find('courir-10-km')?.sharedWith).toEqual(['emma', 'sam', 'lea', 'hugo']);
      expect(navigate).toHaveBeenCalledWith(['/objectives', 'courir-10-km']);
    });

    it('selects a person again after deselecting them', () => {
      component.toggle('alex');
      expect(component.isSelected('alex')).toBe(false);
      component.toggle('alex');
      expect(component.isSelected('alex')).toBe(true);
    });

    it('invites a new person and selects them', () => {
      (element.querySelector('.link-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const input = element.querySelector('.invite input') as HTMLInputElement;
      input.value = 'Zoé';
      (element.querySelector('.invite') as HTMLFormElement).dispatchEvent(new Event('submit'));
      fixture.detectChanges();

      const zoe = store.contacts().find((contact) => contact.name === 'Zoé');
      expect(zoe).toBeDefined();
      expect(component.isSelected(zoe!.id)).toBe(true);
      expect(element.querySelector('.invite')).toBeNull();
    });

    it('copies the share link, or explains when the clipboard is unavailable', async () => {
      const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
      await component.copyLink();
      fixture.detectChanges();
      expect(writeText).toHaveBeenCalledWith('https://plano.app/objectif/courir-10-km-a1b2c3');
      expect(element.querySelector('.link button')?.textContent).toBe('Copié !');

      writeText.mockRejectedValue(new Error('denied'));
      await component.copyLink();
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')).not.toBeNull();
    });
  });

  it('is read-only for objectives shared by someone else', () => {
    setUp('economiser-1000');

    expect(element.querySelector('.note')?.textContent).toContain('Partagé par Camille');
    expect((element.querySelector('.primary-button') as HTMLButtonElement).disabled).toBe(true);
    expect(element.querySelector('.link-button')).toBeNull();

    component.toggle('alex');
    component.share();
    expect(store.find('economiser-1000')?.sharedWith).toEqual(['me', 'alex']);
  });

  it('falls back to a generic owner name when the owner is unknown', () => {
    setUp('economiser-1000');
    store.update('economiser-1000', { ownerId: 'ghost' });
    fixture.detectChanges();

    expect(element.querySelector('.note')?.textContent).toContain('une autre personne');
  });

  it('handles unknown objectives and a missing route id', () => {
    setUp('inconnu');
    expect(element.querySelector('.empty')).not.toBeNull();
    expect(component.owner()).toBeUndefined();
    expect(component.tint()).toBe('');
    expect(component.shareLink()).toBe('plano.app/objectif/');
    expect(component.selected()).toEqual([]);

    TestBed.resetTestingModule();
    setUp();
    expect(component.objective()).toBeUndefined();
  });
});
