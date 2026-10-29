import { ComponentFixture, TestBed } from '@angular/core/testing';
import { listDetail } from '../testing/lists-fixtures';
import { ListEditorComponent, ListEdits } from './list-editor.component';

describe('ListEditorComponent', () => {
  let fixture: ComponentFixture<ListEditorComponent>;
  let editor: ListEditorComponent;
  let saved: ListEdits[];

  beforeEach(() => {
    fixture = TestBed.createComponent(ListEditorComponent);
    fixture.componentRef.setInput('list', listDetail({ description: 'Pour samedi' }));
    editor = fixture.componentInstance;
    saved = [];
    editor.save.subscribe((edits) => saved.push(edits));
    fixture.detectChanges();
  });

  it('starts from the current list and emits the edited drafts', () => {
    expect(editor.draftName()).toBe('Courses');
    expect(editor.draftDescription()).toBe('Pour samedi');

    editor.draftName.set('  Courses du week-end ');
    editor.draftIcon.set('gift');
    editor.draftColor.set('#e65591');
    editor.submit();

    expect(saved).toEqual([
      { name: 'Courses du week-end', icon: 'gift', color: '#e65591', description: 'Pour samedi' },
    ]);
  });

  it('opens with the name focused and selected, so typing replaces it', async () => {
    // Rendered in the document, where focus can land.
    document.body.append(fixture.nativeElement as HTMLElement);
    const fresh = TestBed.createComponent(ListEditorComponent);
    fresh.componentRef.setInput('list', listDetail({ name: 'Nouvelle liste' }));
    document.body.append(fresh.nativeElement as HTMLElement);
    fresh.detectChanges();
    await fresh.whenStable();

    const name = (fresh.nativeElement as HTMLElement).querySelector('input[type="text"]') as HTMLInputElement;
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 'Nouvelle liste'.length]);
    (fresh.nativeElement as HTMLElement).remove();
    (fixture.nativeElement as HTMLElement).remove();
  });

  it('hands the drafts over when asked to invite someone', () => {
    const shared: ListEdits[] = [];
    editor.share.subscribe((edits) => shared.push(edits));
    editor.draftName.set('Courses du samedi');

    ((fixture.nativeElement as HTMLElement).querySelector('.sharing-row button') as HTMLButtonElement).click();

    expect(shared).toEqual([{ name: 'Courses du samedi', icon: 'cart', color: '#2ecb70', description: 'Pour samedi' }]);
    // Inviting is not saving: the parent decides.
    expect(saved).toEqual([]);
  });

  it('keeps the current name when the draft is blank', () => {
    editor.draftName.set('   ');
    editor.submit();

    expect(saved.length).toBe(1);
    expect(saved[0].name).toBe('Courses');
  });

  it('asks to share or delete the list', () => {
    const asked: string[] = [];
    editor.share.subscribe(() => asked.push('share'));
    editor.delete.subscribe(() => asked.push('delete'));
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('.sharing-row button') as HTMLButtonElement).click();
    (element.querySelector('.delete-list') as HTMLButtonElement).click();

    expect(asked).toEqual(['share', 'delete']);
  });

  it('emits closed from the cancel button without saving', () => {
    let closed = false;
    editor.closed.subscribe(() => (closed = true));

    ((fixture.nativeElement as HTMLElement).querySelector('.editor-header button') as HTMLButtonElement).click();

    expect(closed).toBe(true);
    expect(saved).toEqual([]);
  });
});
