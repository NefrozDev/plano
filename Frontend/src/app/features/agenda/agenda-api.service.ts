import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type {
  AgendaEventView,
  ImportAgendaEventsRequest,
  ImportAgendaEventsResponse,
  RespondAgendaEventRequest,
  SaveAgendaEventRequest,
} from '@plano/common';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/http/api-base-url';

/** Thin HTTP client of the agenda API; state lives in AgendaStore. */
@Injectable({ providedIn: 'root' })
export class AgendaApiService {
  private readonly http = inject(HttpClient);
  private readonly events = `${inject(API_BASE_URL)}/agenda/events`;

  findAll(): Observable<AgendaEventView[]> {
    return this.http.get<AgendaEventView[]>(this.events);
  }

  findOne(id: string): Observable<AgendaEventView> {
    return this.http.get<AgendaEventView>(`${this.events}/${id}`);
  }

  create(event: SaveAgendaEventRequest): Observable<AgendaEventView> {
    return this.http.post<AgendaEventView>(this.events, event);
  }

  update(id: string, event: SaveAgendaEventRequest): Observable<AgendaEventView> {
    return this.http.put<AgendaEventView>(`${this.events}/${id}`, event);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.events}/${id}`);
  }

  respond(id: string, answer: RespondAgendaEventRequest): Observable<AgendaEventView> {
    return this.http.post<AgendaEventView>(`${this.events}/${id}/response`, answer);
  }

  importLocal(request: ImportAgendaEventsRequest): Observable<ImportAgendaEventsResponse> {
    return this.http.post<ImportAgendaEventsResponse>(`${this.events}/import`, request);
  }
}
