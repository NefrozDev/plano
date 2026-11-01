import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AddObjectiveMemberRequest,
  AddObjectiveSessionRequest,
  CreateObjectiveRequest,
  ImportObjectivesRequest,
  ImportObjectivesResponse,
  IsoDate,
  ObjectiveAgendaItem,
  ObjectiveDetail,
  ObjectiveMemberRole,
  ObjectiveSummary,
  UpdateObjectivePreferencesRequest,
  UpdateObjectiveRequest,
} from '@plano/common';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/http/api-base-url';

/** Thin HTTP client of the objectives API; state lives in ObjectivesStore. */
@Injectable({ providedIn: 'root' })
export class ObjectivesApiService {
  private readonly http = inject(HttpClient);
  private readonly objectives = `${inject(API_BASE_URL)}/objectives`;

  findAll(): Observable<ObjectiveSummary[]> {
    return this.http.get<ObjectiveSummary[]>(this.objectives);
  }

  findOne(id: string): Observable<ObjectiveDetail> {
    return this.http.get<ObjectiveDetail>(`${this.objectives}/${id}`);
  }

  findAgenda(): Observable<ObjectiveAgendaItem[]> {
    return this.http.get<ObjectiveAgendaItem[]>(`${this.objectives}/agenda`);
  }

  create(details: CreateObjectiveRequest): Observable<ObjectiveDetail> {
    return this.http.post<ObjectiveDetail>(this.objectives, details);
  }

  update(id: string, changes: UpdateObjectiveRequest): Observable<ObjectiveDetail> {
    return this.http.patch<ObjectiveDetail>(`${this.objectives}/${id}`, changes);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.objectives}/${id}`);
  }

  reorder(objectiveIds: readonly string[]): Observable<void> {
    return this.http.put<void>(`${this.objectives}/order`, { objectiveIds });
  }

  reorderChildren(id: string, objectiveIds: readonly string[]): Observable<ObjectiveDetail> {
    return this.http.put<ObjectiveDetail>(`${this.objectives}/${id}/children/order`, { objectiveIds });
  }

  updatePreferences(id: string, changes: UpdateObjectivePreferencesRequest): Observable<ObjectiveDetail> {
    return this.http.patch<ObjectiveDetail>(`${this.objectives}/${id}/preferences`, changes);
  }

  addSession(id: string, details: AddObjectiveSessionRequest): Observable<ObjectiveDetail> {
    return this.http.post<ObjectiveDetail>(`${this.objectives}/${id}/sessions`, details);
  }

  removeSession(id: string, sessionId: string): Observable<ObjectiveDetail> {
    return this.http.delete<ObjectiveDetail>(`${this.objectives}/${id}/sessions/${sessionId}`);
  }

  setCheckIn(id: string, date: IsoDate, checked: boolean): Observable<ObjectiveDetail> {
    const url = `${this.objectives}/${id}/check-ins/${date}`;
    return checked ? this.http.put<ObjectiveDetail>(url, {}) : this.http.delete<ObjectiveDetail>(url);
  }

  setProgress(id: string, percent: number): Observable<ObjectiveDetail> {
    return this.http.put<ObjectiveDetail>(`${this.objectives}/${id}/progress`, { percent });
  }

  setCompleted(id: string, completed: boolean): Observable<ObjectiveDetail> {
    return this.http.put<ObjectiveDetail>(`${this.objectives}/${id}/completed`, { completed });
  }

  addMember(id: string, details: AddObjectiveMemberRequest): Observable<ObjectiveDetail> {
    return this.http.post<ObjectiveDetail>(`${this.objectives}/${id}/members`, details);
  }

  updateMember(id: string, userId: string, role: ObjectiveMemberRole): Observable<ObjectiveDetail> {
    return this.http.patch<ObjectiveDetail>(`${this.objectives}/${id}/members/${userId}`, { role });
  }

  removeMember(id: string, userId: string): Observable<ObjectiveDetail> {
    return this.http.delete<ObjectiveDetail>(`${this.objectives}/${id}/members/${userId}`);
  }

  leave(id: string): Observable<void> {
    return this.http.delete<void>(`${this.objectives}/${id}/members/me`);
  }

  importLocal(details: ImportObjectivesRequest): Observable<ImportObjectivesResponse> {
    return this.http.post<ImportObjectivesResponse>(`${this.objectives}/import`, details);
  }
}
