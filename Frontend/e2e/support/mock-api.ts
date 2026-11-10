import type { Page, Route } from '@playwright/test';
import {
  createMockPlanoData,
  DEFAULT_AGENDA_USER_SETTINGS,
  DEFAULT_OBJECTIVE_USER_SETTINGS,
  type AgendaEventView,
  type Friend,
  type FriendRequests,
  type HomeList,
  type NotificationsResponse,
} from '@plano/common';
import type { AuthUser } from '../../src/app/core/auth/auth.models';
import type { GroupDetails } from '../../src/app/core/groups/group.models';
import {
  listDetail,
  listSettings,
  listSummary,
} from '../../src/app/features/lists/testing/lists-fixtures';
import {
  habitDetail,
  metricDetail,
  objectiveDetail,
  objectiveSummary,
} from '../../src/app/features/objectives/testing/objectives-fixtures';
import { CONTACTS } from '../../src/app/testing/contacts';
import { notification } from '../../src/app/testing/notifications-fixtures';

export interface MockOptions {
  /** Nobody signed in: the API answers 401 to the session. */
  signedOut?: boolean;
  /** Signed in from another Synapse app, Plano's terms not accepted yet. */
  termsPending?: boolean;
  /** A new account: no list, objective, event, group or friend. */
  empty?: boolean;
}

/** "Today" of the seed data, which the tests' clock is set to. */
export const TODAY = new Date('2026-10-15T10:30:00');

const user = (termsAccepted: boolean): AuthUser => ({
  id: 'user-ada',
  firstName: 'Ada',
  lastName: 'Lovelace',
  username: 'ada',
  email: 'ada@example.com',
  locale: 'fr',
  avatarVersion: null,
  termsAccepted,
});

const groups: GroupDetails[] = [
  {
    id: 'group-1',
    name: 'Famille',
    inviteCode: 'FAM-2026',
    role: 'owner',
    createdAt: '2026-09-01T08:00:00Z',
    members: [
      {
        id: 'user-ada',
        firstName: 'Ada',
        lastName: 'Lovelace',
        username: 'ada',
        email: 'ada@example.com',
        role: 'owner',
        joinedAt: '2026-09-01T08:00:00Z',
        avatarVersion: null,
      },
      {
        id: 'user-bob',
        firstName: 'Bob',
        lastName: 'Martin',
        username: 'bob',
        email: 'bob@example.com',
        role: 'member',
        joinedAt: '2026-09-02T08:00:00Z',
        avatarVersion: null,
      },
    ],
  },
];

const friends: Friend[] = [
  {
    id: 'user-bob',
    username: 'bob',
    firstName: 'Bob',
    lastName: 'Martin',
    avatarVersion: null,
    since: '2026-09-02T08:00:00Z',
  },
];

const friendRequests: FriendRequests = {
  incoming: [
    {
      id: 'request-1',
      user: {
        id: 'user-eve',
        username: 'eve',
        firstName: 'Eve',
        lastName: 'Durand',
        avatarVersion: null,
      },
      createdAt: '2026-10-14T08:00:00Z',
    },
  ],
  outgoing: [],
};

const homeLists: HomeList[] = [
  {
    id: 'list-1',
    name: 'Courses',
    icon: listSummary().icon,
    color: listSummary().color,
    role: 'owner',
    removeChecked: false,
    remaining: 3,
    entries: [
      { id: 'milk', name: 'Lait' },
      { id: 'bread', name: 'Pain' },
    ],
  },
];

/** The seed events (Rendez-vous projet, Déjeuner…) as the API serves them to their organiser. */
function agendaEvents(): AgendaEventView[] {
  const data = createMockPlanoData();
  return data.agenda.events.map((event) => ({
    ...event,
    owner: { id: 'me', name: 'Vous', avatarVersion: null },
    mine: true,
    status: 'accepted' as const,
    attendees: event.participantIds.flatMap((id) => {
      const contact = data.agenda.contacts.find(
        (candidate) => candidate.id === id,
      );
      return contact
        ? [
            {
              id,
              name: contact.name,
              avatarVersion: null,
              status: 'accepted' as const,
            },
          ]
        : [];
    }),
  }));
}

const objectives = [
  objectiveSummary(),
  objectiveSummary({ id: 'obj-2', title: 'Méditer chaque jour' }),
];

const notifications = (empty: boolean): NotificationsResponse => ({
  items: empty ? [] : [notification()],
  unread: {
    friends: empty ? 0 : 1,
    lists: empty ? 0 : 1,
    objectives: 0,
    agenda: 0,
  },
});

/** Answers every /api/v1 call the app makes, like the real API would for these data. */
export async function mockApi(
  page: Page,
  options: MockOptions = {},
): Promise<void> {
  const empty = options.empty ?? false;
  await page.clock.setFixedTime(TODAY);

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api\/v1/, '');
    const method = request.method();
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    const notFound = () => json({ statusCode: 404, message: 'Not Found' }, 404);

    if (path === '/auth/session') {
      return options.signedOut
        ? json({ statusCode: 401 }, 401)
        : json(user(!options.termsPending));
    }
    // 204 tells EventSource to stop, rather than reconnect over and over.
    if (path === '/live/stream') return route.fulfill({ status: 204 });
    if (method !== 'GET')
      return json(path.startsWith('/users/me') ? user(true) : {});

    const routes: Record<string, unknown> = {
      '/users/me': user(true),
      '/settings/agenda': DEFAULT_AGENDA_USER_SETTINGS,
      '/settings/objectives': DEFAULT_OBJECTIVE_USER_SETTINGS,
      '/settings/lists': listSettings(),
      '/notifications': notifications(empty),
      '/friends': empty ? [] : friends,
      '/friends/requests': empty
        ? { incoming: [], outgoing: [] }
        : friendRequests,
      '/friends/search': [],
      '/contacts': empty ? [] : CONTACTS,
      '/groups': empty ? [] : groups,
      '/agenda/events': empty ? [] : agendaEvents(),
      '/lists': empty
        ? []
        : [listSummary(), listSummary({ id: 'list-2', name: 'Vacances' })],
      '/lists/home': empty ? [] : homeLists,
      '/lists/reminders': [],
      '/objectives': empty ? [] : objectives,
      '/objectives/home': empty ? [] : objectives,
      '/objectives/agenda': [],
      '/objectives/templates': [],
    };
    if (path in routes) return json(routes[path]);

    const [, area, id, rest] =
      /^\/([^/]+)\/([^/]+)(?:\/(.*))?$/.exec(path) ?? [];
    if (area === 'groups' && !rest)
      return groups.some((g) => g.id === id) ? json(groups[0]) : notFound();
    if (area === 'lists' && !rest)
      return id === 'list-1' ? json(listDetail()) : notFound();
    if (area === 'objectives') {
      if (rest === 'activity' || rest === 'comments') return json([]);
      if (id === 'obj-1' && !rest) return json(objectiveDetail());
      if (id === 'obj-metric' && !rest)
        return json(metricDetail({ id: 'obj-metric' }));
      if (id === 'obj-habit' && !rest)
        return json(habitDetail({ id: 'obj-habit' }));
      return notFound();
    }
    if (area === 'agenda' && id === 'events' && rest) {
      const event = agendaEvents().find((candidate) => candidate.id === rest);
      return event ? json(event) : notFound();
    }
    return notFound();
  });
}
