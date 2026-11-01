import type { MockInstance } from 'vitest';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import type { ObjectiveSummary } from '@plano/common';
import { ConfirmService } from '../../../shared/ui/confirm.service';
import { WHEEL_SWIPE_END_MS } from '../../../shared/ui/swipe-to-delete';
import { provideObjectivesTesting, settleObjectives } from '../objectives.testing';
import { ObjectivesStore } from '../objectives.store';
import { objectiveSummary } from '../testing/objectives-fixtures';
import { NOT_OWNER_NOTICE, ObjectiveSwipeCardComponent } from './objective-swipe-card.component';
import type { ObjectiveCardView } from './objective-card.component';

@Component({
  imports: [ObjectiveSwipeCardComponent],
  template: `<app-objective-swipe-card [card]="card()" [tile]="tile()" (refused)="refusals.push($event)" />`,
})
class HostComponent {
  readonly card = signal<ObjectiveCardView>(view(objectiveSummary()));
  readonly tile = signal(false);
  readonly refusals: string[] = [];
}

function view(objective: ObjectiveSummary): ObjectiveCardView {
  return { objective, progressText: '', caption: '', tint: '#3264ed', timelapse: null };
}

describe('ObjectiveSwipeCardComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let element: HTMLElement;
  let http: HttpTestingController;
  let confirm: MockInstance<ConfirmService['ask']>;
  let navigate: MockInstance<Router['navigateByUrl']>;

  const slide = () => element.querySelector('.slide') as HTMLElement;
  const link = () => element.querySelector('a.card') as HTMLAnchorElement;
  const pointer = (type: string, x: number, target: Element = slide()) =>
    target.dispatchEvent(new PointerEvent(type, { pointerId: 1, clientX: x, bubbles: true, cancelable: true }));
  /** A press and a slide from x=200 to `to`, still held. */
  const slideTo = (to: number) => {
    slide().setPointerCapture = vi.fn();
    pointer('pointerdown', 200);
    pointer('pointermove', to);
    fixture.detectChanges();
  };
  const release = () => {
    pointer('pointerup', 0);
    fixture.detectChanges();
  };
  const showRole = (role: ObjectiveSummary['role']) => {
    fixture.componentInstance.card.set(view(objectiveSummary({ role })));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: provideObjectivesTesting() });
    http = TestBed.inject(HttpTestingController);
    confirm = vi.spyOn(TestBed.inject(ConfirmService), 'ask').mockResolvedValue(true);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(HostComponent);
    element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('slides left, clamped, uncovering the delete button', () => {
    expect(element.querySelector('app-objective-swipe-card')?.classList).not.toContain('revealed');

    slideTo(180);
    expect(slide().style.transform).toBe('translateX(-20px)');
    expect(element.querySelector('app-objective-swipe-card')?.classList).toContain('revealed');

    slideTo(0);
    expect(slide().style.transform).toBe('translateX(-58px)');
  });

  it('asks before deleting, past the threshold, and removes the card', async () => {
    const store = TestBed.inject(ObjectivesStore);
    const remove = vi.spyOn(store, 'remove');

    slideTo(100);
    expect(confirm).not.toHaveBeenCalled();
    release();
    expect(slide().style.transform).toBe('');
    expect(confirm).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        heading: 'Supprimer l’objectif ?',
        message: '« Courir 10 km » et tout ce qu’il contient seront supprimés définitivement.',
        tone: 'danger',
      }),
    );
    await settleObjectives();

    expect(remove).toHaveBeenCalledExactlyOnceWith('obj-1');
    const request = http.expectOne('/api/v1/objectives/obj-1');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);
  });

  it('deletes nothing when the question is declined', async () => {
    confirm.mockResolvedValue(false);
    const remove = vi.spyOn(TestBed.inject(ObjectivesStore), 'remove');

    slideTo(100);
    release();
    await settleObjectives();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it('warns that a shared objective goes for everyone', () => {
    fixture.componentInstance.card.set(view(objectiveSummary({ sharing: 'shared' })));
    fixture.detectChanges();
    confirm.mockResolvedValue(false);

    slideTo(100);
    release();

    expect(confirm.mock.calls[0][0].message).toContain('définitivement, pour tout le monde.');
  });

  it('snaps back from a short swipe without asking', () => {
    slideTo(180);
    release();

    expect(slide().style.transform).toBe('');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('does not open the objective from the click that ends a swipe, but does from the next tap', () => {
    slideTo(180);
    release();
    const afterSwipe = new MouseEvent('click', { bubbles: true, cancelable: true });
    link().dispatchEvent(afterSwipe);
    expect(afterSwipe.defaultPrevented).toBe(true);
    expect(navigate).not.toHaveBeenCalled();

    pointer('pointerdown', 200);
    pointer('pointerup', 200);
    link().click();
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('opens the objective on a plain tap, without asking', () => {
    pointer('pointerdown', 200);
    pointer('pointerup', 202);
    link().click();

    expect(navigate).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks after a two-finger touchpad swipe, and leaves vertical scrolling alone', () => {
    confirm.mockResolvedValue(false);
    vi.useFakeTimers();
    try {
      const vertical = new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true });
      slide().dispatchEvent(vertical);
      expect(vertical.defaultPrevented).toBe(false);
      vi.advanceTimersByTime(WHEEL_SWIPE_END_MS);
      expect(confirm).not.toHaveBeenCalled();

      const sideways = new WheelEvent('wheel', { deltaX: 80, bubbles: true, cancelable: true });
      slide().dispatchEvent(sideways);
      expect(sideways.defaultPrevented).toBe(true);
      vi.advanceTimersByTime(WHEEL_SWIPE_END_MS);
      expect(confirm).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks from the Delete key and from the uncovered button', () => {
    confirm.mockResolvedValue(false);
    link().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(confirm).toHaveBeenCalledTimes(1);

    (element.querySelector('.delete') as HTMLButtonElement).click();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(element.querySelector('.delete')?.getAttribute('aria-label')).toBe('Supprimer l’objectif Courir 10 km');
  });

  it('keeps the card of someone else’s objective in place and says why', () => {
    showRole('contributor');
    expect(element.querySelector('.delete')).toBeNull();

    slideTo(100);
    expect(slide().style.transform).toBe('');
    expect(element.querySelector('app-objective-swipe-card')?.classList).not.toContain('revealed');
    release();
    expect(fixture.componentInstance.refusals).toEqual([NOT_OWNER_NOTICE]);

    link().dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(confirm).not.toHaveBeenCalled();
    expect(fixture.componentInstance.refusals).toHaveLength(1);
  });

  it('refuses viewers too, and passes the tile layout to the card', () => {
    showRole('viewer');
    fixture.componentInstance.tile.set(true);
    fixture.detectChanges();

    slideTo(100);
    release();

    expect(fixture.componentInstance.refusals).toEqual([NOT_OWNER_NOTICE]);
    expect(element.querySelector('app-objective-swipe-card')?.classList).toContain('tile');
    expect(element.querySelector('app-objective-card')?.classList).toContain('tile');
  });
});
