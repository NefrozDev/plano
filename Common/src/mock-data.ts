import type {
  IsoDate,
  Objective,
  ObjectiveSession,
  ObjectivesData,
  PlanoData,
} from './models';
import { agendaSeed } from './agenda-mock-data';
import { DEFAULT_OBJECTIVE_SETTINGS } from './initial-data';

/** Consecutive dates from `start`, skipping every `skipEvery`-th day (0 keeps them all). */
function dailyDates(start: IsoDate, days: number, skipEvery = 0): IsoDate[] {
  const [year, month, day] = start.split('-').map(Number);
  const dates: IsoDate[] = [];
  for (let offset = 0; offset < days; offset++) {
    if (skipEvery && offset % skipEvery === skipEvery - 1) continue;
    dates.push(new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10));
  }
  return dates;
}

function session(
  id: string,
  date: IsoDate,
  status: ObjectiveSession['status'],
  value = 0,
  label = '',
  durationMinutes?: number,
): ObjectiveSession {
  return { id, date, status, value, label, ...(durationMinutes ? { durationMinutes } : {}) };
}

function objective(base: Pick<Objective, 'id' | 'title' | 'category' | 'tracking' | 'createdOn' | 'dueDate'> & Partial<Objective>): Objective {
  return {
    status: 'active',
    archived: false,
    ownerId: 'me',
    sharedWith: [],
    shareCode: `${base.id}-a1b2c3`,
    completedOn: null,
    description: '',
    plan: '',
    reminder: { frequency: 'none', time: '09:00', weekday: 0 },
    dueReminder: 'day-before',
    metric: null,
    sessions: [],
    steps: [],
    habit: null,
    ...base,
  };
}

const objectives: ObjectivesData = {
  currentUserId: 'me',
  contacts: [
    { id: 'me', name: 'Vous', initials: 'V', color: '#325be2' },
    { id: 'camille', name: 'Camille', initials: 'C', color: '#a76142' },
    { id: 'alex', name: 'Alex', initials: 'A', color: '#d07863' },
    { id: 'emma', name: 'Emma', initials: 'E', color: '#3d6f83' },
    { id: 'sam', name: 'Sam', initials: 'S', color: '#35485d' },
    { id: 'lea', name: 'Léa', initials: 'L', color: '#8a5cc2' },
    { id: 'hugo', name: 'Hugo', initials: 'H', color: '#2f8f6b' },
  ],
  items: [
    objective({
      id: 'courir-10-km',
      title: 'Courir 10 km',
      category: 'health',
      tracking: 'metric',
      createdOn: '2026-09-14',
      dueDate: '2026-11-30',
      description: 'Je veux courir 10 km en une seule fois.',
      plan: '3 entraînements par semaine',
      reminder: { frequency: 'weekly', time: '09:00', weekday: 0 },
      sharedWith: ['camille', 'alex', 'emma', 'sam', 'lea', 'hugo'],
      metric: { unit: 'km', target: 10, aggregation: 'max', sessionsTarget: 24 },
      sessions: [
        session('run-1', '2026-09-21', 'done', 3, 'Sortie 3 km', 20),
        session('run-2', '2026-09-23', 'done', 3.5, 'Sortie 3,5 km', 24),
        session('run-3', '2026-09-26', 'rest'),
        session('run-4', '2026-09-28', 'done', 4.2, 'Sortie 4 km', 27),
        session('run-5', '2026-09-30', 'missed', 0, 'Sortie 4,5 km'),
        session('run-6', '2026-10-03', 'done', 4.8, 'Sortie 5 km', 30),
        session('run-7', '2026-10-05', 'done', 5, 'Fractionné', 31),
        session('run-8', '2026-10-07', 'done', 5.5, 'Sortie 5,5 km', 34),
        session('run-9', '2026-10-10', 'rest'),
        session('run-10', '2026-10-12', 'done', 6, 'Sortie 6 km', 37),
        session('run-11', '2026-10-14', 'done', 6.5, 'Sortie longue', 40),
        session('run-12', '2026-10-17', 'planned', 7, 'Sortie 7 km'),
        session('run-13', '2026-10-19', 'planned', 7.5, 'Sortie 7,5 km'),
        session('run-14', '2026-10-21', 'planned', 8, 'Sortie 8 km'),
      ],
    }),
    objective({
      id: 'apprendre-italien',
      title: 'Apprendre l’italien',
      category: 'learning',
      tracking: 'steps',
      createdOn: '2026-08-01',
      dueDate: '2027-03-15',
      description: 'Pouvoir tenir une conversation simple pendant les vacances.',
      plan: '20 minutes par jour',
      reminder: { frequency: 'daily', time: '19:00', weekday: 0 },
      steps: [
        { id: 'step-1', label: 'Apprendre 100 mots', done: true, completedOn: '2026-08-20' },
        { id: 'step-2', label: 'Suivre 10 leçons', done: true, completedOn: '2026-09-28' },
        { id: 'step-3', label: 'Avoir une conversation de 5 min', done: false, completedOn: null },
        { id: 'step-4', label: 'Regarder un film en italien', done: false, completedOn: null },
        { id: 'step-5', label: 'Lire un livre en italien', done: false, completedOn: null },
      ],
    }),
    objective({
      id: 'economiser-1000',
      title: 'Économiser 1 000 €',
      category: 'finance',
      tracking: 'metric',
      createdOn: '2026-07-01',
      dueDate: '2026-12-31',
      ownerId: 'camille',
      sharedWith: ['me', 'alex'],
      description: 'Constituer une épargne de précaution.',
      plan: '150 € par mois',
      metric: { unit: '€', target: 1000, aggregation: 'sum', sessionsTarget: 6 },
      sessions: [
        session('save-1', '2026-07-31', 'done', 150, 'Virement juillet'),
        session('save-2', '2026-08-31', 'done', 150, 'Virement août'),
        session('save-3', '2026-09-30', 'done', 150, 'Virement septembre'),
        session('save-4', '2026-10-31', 'planned', 150, 'Virement octobre'),
      ],
    }),
    objective({
      id: 'lire-12-livres',
      title: 'Lire 12 livres',
      category: 'development',
      tracking: 'metric',
      createdOn: '2026-01-02',
      dueDate: '2026-12-31',
      plan: 'Un livre par mois',
      metric: { unit: 'livres', target: 12, aggregation: 'sum', sessionsTarget: 12 },
      sessions: [
        session('book-1', '2026-02-10', 'done', 1, 'L’Étranger'),
        session('book-2', '2026-03-22', 'done', 1, 'Sapiens'),
        session('book-3', '2026-05-04', 'done', 1, 'Dune'),
        session('book-4', '2026-06-18', 'done', 1, 'Atomic Habits'),
        session('book-5', '2026-08-09', 'done', 1, 'Le Petit Prince'),
        session('book-6', '2026-09-27', 'done', 1, 'Educated'),
      ],
    }),
    objective({
      id: 'mediter-30-min',
      title: 'Méditer 30 min par jour',
      category: 'health',
      tracking: 'habit',
      createdOn: '2026-09-01',
      dueDate: '2026-11-29',
      description: 'Prendre un temps calme chaque matin.',
      reminder: { frequency: 'daily', time: '08:00', weekday: 0 },
      habit: { targetDays: 90, checkIns: dailyDates('2026-09-01', 45, 4) },
    }),
    objective({
      id: 'mediter-30-jours',
      title: 'Méditer 30 jours',
      category: 'other',
      tracking: 'habit',
      status: 'completed',
      createdOn: '2026-08-01',
      dueDate: '2026-08-31',
      completedOn: '2026-08-30',
      habit: { targetDays: 30, checkIns: dailyDates('2026-08-01', 30) },
    }),
    objective({
      id: 'pompes-50',
      title: 'Faire 50 pompes d’affilée',
      category: 'health',
      tracking: 'metric',
      status: 'paused',
      createdOn: '2026-06-01',
      dueDate: '2027-01-31',
      metric: { unit: 'pompes', target: 50, aggregation: 'max', sessionsTarget: 30 },
      sessions: [
        session('push-1', '2026-06-03', 'done', 18, 'Série test'),
        session('push-2', '2026-06-20', 'done', 30, 'Série max'),
      ],
    }),
    objective({
      id: 'apprendre-guitare',
      title: 'Apprendre la guitare',
      category: 'learning',
      tracking: 'steps',
      archived: true,
      createdOn: '2025-11-01',
      dueDate: '2026-06-30',
      steps: [
        { id: 'chords', label: 'Connaître 5 accords', done: true, completedOn: '2026-01-15' },
        { id: 'song', label: 'Jouer une chanson complète', done: false, completedOn: null },
      ],
    }),
  ],
  settings: DEFAULT_OBJECTIVE_SETTINGS,
  recentIds: ['courir-10-km', 'apprendre-italien', 'economiser-1000', 'lire-12-livres'],
};

const seed: PlanoData = {
  version: 1,
  dashboard: {
    tasks: [
      { id: 'presentation', label: 'Préparer la présentation', done: false },
      { id: 'running', label: '30 minutes de course à pied', done: true },
      { id: 'restaurant', label: 'Réserver le restaurant', done: false },
    ],
  },
  objectives,
  agenda: agendaSeed,
};

export function createMockPlanoData(): PlanoData {
  return structuredClone(seed);
}
