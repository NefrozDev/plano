import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { UpdateEntryRequest } from '@plano/common';
import { MEMBER_ID, entry, listDetail } from '../testing/lists-fixtures';
import { ListEntryDetailsComponent } from './list-entry-details.component';

describe('ListEntryDetailsComponent', () => {
  let fixture: ComponentFixture<ListEntryDetailsComponent>;
  let element: HTMLElement;
  let changes: UpdateEntryRequest[];

  beforeEach(() => {
    fixture = TestBed.createComponent(ListEntryDetailsComponent);
    fixture.componentRef.setInput('entry', entry('milk', 'Lait', { assignedTo: MEMBER_ID }));
    fixture.componentRef.setInput('listTitle', 'Courses');
    fixture.componentRef.setInput('sectionName', 'Produits frais');
    fixture.componentRef.setInput('members', listDetail().members);
    changes = [];
    fixture.componentInstance.change.subscribe((change) => changes.push(change));
    fixture.detectChanges();
    element = fixture.nativeElement as HTMLElement;
  });

  const field = <T extends HTMLElement>(selector: string) => element.querySelector(selector) as T;

  it('shows who added the entry and when, and its assignee', () => {
    expect(element.textContent).toContain('Ada Lovelace');
    expect(element.textContent).toContain('13 octobre 2026');
    expect(field<HTMLSelectElement>('select').value).toBe(MEMBER_ID);
  });

  it('emits each change when a field is committed, mapping empty values to null', () => {
    const name = field<HTMLInputElement>('.entry-name-editor input');
    name.value = '  Lait entier ';
    name.dispatchEvent(new Event('change'));
    const assignee = field<HTMLSelectElement>('select');
    assignee.value = '';
    assignee.dispatchEvent(new Event('change'));
    const reminder = field<HTMLInputElement>('input[type="datetime-local"]');
    reminder.value = '';
    reminder.dispatchEvent(new Event('change'));

    expect(changes).toEqual([{ name: 'Lait entier' }, { assignedTo: null }, { reminder: null }]);
  });

  it('restores the name instead of saving a blank one', () => {
    const name = field<HTMLInputElement>('.entry-name-editor input');
    name.value = '   ';
    name.dispatchEvent(new Event('change'));

    expect(changes).toEqual([]);
    expect(name.value).toBe('Lait');
  });

  it('disables every field for viewers', () => {
    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();

    const controls = Array.from(element.querySelectorAll<HTMLInputElement>('input, select, textarea, .details-toggle'));
    expect(controls.length).toBe(5);
    expect(controls.every((control) => control.disabled)).toBeTrue();
  });
});
