import type { ObjectiveDetail, ObjectiveSummary } from '@plano/common';

export const ME = 'user-ada';
export const OTHER = 'user-bob';

/** A private objective without bars, as GET /objectives returns it to its owner. */
export function objectiveSummary(changes: Partial<ObjectiveSummary> = {}): ObjectiveSummary {
  return {
    id: 'obj-1',
    parentId: null,
    title: 'Courir 10 km',
    category: 'health',
    status: 'active',
    archived: false,
    completion: 'none',
    percent: null,
    amount: null,
    timelapse: 'off',
    startDate: '2026-10-01',
    dueDate: null,
    completedAt: null,
    weight: 1,
    role: 'owner',
    owner: { id: ME, name: 'Ada Lovelace' },
    sharing: 'private',
    people: [{ id: ME, name: 'Ada Lovelace' }],
    assignee: null,
    completedBy: null,
    childCount: 0,
    completedChildCount: 0,
    onHome: false,
    ...changes,
  };
}

/** The same objective, as GET /objectives/:id returns it. */
export function objectiveDetail(changes: Partial<ObjectiveDetail> = {}): ObjectiveDetail {
  return {
    ...objectiveSummary(),
    description: '',
    plan: '',
    metric: null,
    habitTargetDays: null,
    manualProgress: 0,
    breadcrumb: [],
    children: [],
    descendantCount: 0,
    sessions: [],
    checkIns: [],
    members: [{ id: ME, name: 'Ada Lovelace', role: 'owner', inheritedFrom: null }],
    contributions: [],
    reminder: { frequency: 'none', time: '09:00', weekday: 0 },
    dueReminder: 'none',
    ...changes,
  };
}

/** A numeric objective: 6,5 km of 10 km, on the sessions it holds. */
export function metricDetail(changes: Partial<ObjectiveDetail> = {}): ObjectiveDetail {
  return objectiveDetail({
    completion: 'metric',
    percent: 65,
    amount: { current: 6.5, target: 10, unit: 'km' },
    metric: { unit: 'km', target: 10, aggregation: 'max' },
    sessions: [
      {
        id: 'run-1',
        date: '2026-10-12',
        status: 'done',
        label: 'Sortie 6 km',
        value: 6,
        durationMinutes: 37,
        author: { id: ME, name: 'Ada Lovelace' },
      },
      {
        id: 'run-2',
        date: '2026-10-14',
        status: 'done',
        label: 'Sortie longue',
        value: 6.5,
        durationMinutes: 40,
        author: { id: ME, name: 'Ada Lovelace' },
      },
      {
        id: 'run-3',
        date: '2026-10-13',
        status: 'missed',
        label: 'Ratée',
        value: 0,
        durationMinutes: null,
        author: { id: ME, name: 'Ada Lovelace' },
      },
      {
        id: 'run-4',
        date: '2026-10-17',
        status: 'planned',
        label: 'Sortie 7 km',
        value: 7,
        durationMinutes: null,
        author: { id: ME, name: 'Ada Lovelace' },
      },
    ],
    ...changes,
  });
}

/** A habit of 30 days, three of them checked by the signed-in person. */
export function habitDetail(changes: Partial<ObjectiveDetail> = {}): ObjectiveDetail {
  return objectiveDetail({
    title: 'Méditer',
    completion: 'habit',
    percent: 10,
    amount: { current: 3, target: 30, unit: 'jours' },
    habitTargetDays: 30,
    checkIns: [
      { date: '2026-10-05', userId: ME },
      { date: '2026-10-06', userId: ME },
      { date: '2026-10-08', userId: ME },
    ],
    ...changes,
  });
}

/** An objective tracked by its two sub-objectives, one of them done. */
export function treeDetail(changes: Partial<ObjectiveDetail> = {}): ObjectiveDetail {
  return objectiveDetail({
    title: 'Préparer le voyage',
    completion: 'children',
    percent: 50,
    childCount: 2,
    completedChildCount: 1,
    descendantCount: 2,
    children: [
      objectiveSummary({ id: 'child-1', parentId: 'obj-1', title: 'Réserver', status: 'completed' }),
      objectiveSummary({ id: 'child-2', parentId: 'obj-1', title: 'Faire les valises' }),
    ],
    ...changes,
  });
}
