import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AddListMemberRequest,
  CreateEntryRequest,
  CreateListRequest,
  CreateSectionRequest,
  ListDetail,
  ListEntry,
  ListMember,
  ListMemberRole,
  ListReminder,
  ListSection,
  ListSettings,
  ListSummary,
  UpdateEntryRequest,
  UpdateListRequest,
  UpdateListSettingsRequest,
} from '@plano/common';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/http/api-base-url';

/** Thin HTTP client of the lists API; state lives in ListsStore. */
@Injectable({ providedIn: 'root' })
export class ListsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);
  private readonly lists = `${this.baseUrl}/lists`;

  findAll(): Observable<ListSummary[]> {
    return this.http.get<ListSummary[]>(this.lists);
  }

  findOne(listId: string): Observable<ListDetail> {
    return this.http.get<ListDetail>(`${this.lists}/${listId}`);
  }

  findReminders(): Observable<ListReminder[]> {
    return this.http.get<ListReminder[]>(`${this.lists}/reminders`);
  }

  create(details: CreateListRequest): Observable<ListDetail> {
    return this.http.post<ListDetail>(this.lists, details);
  }

  update(listId: string, changes: UpdateListRequest): Observable<ListDetail> {
    return this.http.patch<ListDetail>(`${this.lists}/${listId}`, changes);
  }

  remove(listId: string): Observable<void> {
    return this.http.delete<void>(`${this.lists}/${listId}`);
  }

  addSection(listId: string, details: CreateSectionRequest): Observable<ListSection> {
    return this.http.post<ListSection>(`${this.lists}/${listId}/sections`, details);
  }

  addEntry(listId: string, sectionId: string, details: CreateEntryRequest): Observable<ListEntry> {
    return this.http.post<ListEntry>(`${this.lists}/${listId}/sections/${sectionId}/entries`, details);
  }

  updateEntry(listId: string, entryId: string, changes: UpdateEntryRequest): Observable<ListEntry> {
    return this.http.patch<ListEntry>(`${this.lists}/${listId}/entries/${entryId}`, changes);
  }

  removeEntry(listId: string, entryId: string): Observable<void> {
    return this.http.delete<void>(`${this.lists}/${listId}/entries/${entryId}`);
  }

  reorderEntries(listId: string, sectionId: string, entryIds: readonly string[]): Observable<void> {
    return this.http.put<void>(`${this.lists}/${listId}/sections/${sectionId}/order`, { entryIds });
  }

  addMember(listId: string, details: AddListMemberRequest): Observable<ListMember> {
    return this.http.post<ListMember>(`${this.lists}/${listId}/members`, details);
  }

  updateMember(listId: string, userId: string, role: ListMemberRole): Observable<ListMember> {
    return this.http.patch<ListMember>(`${this.lists}/${listId}/members/${userId}`, { role });
  }

  removeMember(listId: string, userId: string): Observable<void> {
    return this.http.delete<void>(`${this.lists}/${listId}/members/${userId}`);
  }

  removeAllMembers(listId: string): Observable<void> {
    return this.http.delete<void>(`${this.lists}/${listId}/members`);
  }

  findSettings(): Observable<ListSettings> {
    return this.http.get<ListSettings>(`${this.baseUrl}/settings/lists`);
  }

  updateSettings(changes: UpdateListSettingsRequest): Observable<ListSettings> {
    return this.http.patch<ListSettings>(`${this.baseUrl}/settings/lists`, changes);
  }
}
