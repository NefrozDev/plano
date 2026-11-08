import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { AgendaEvent } from '../../agenda/entities/agenda-event.entity';
import { AgendaGuest } from '../../agenda/entities/agenda-guest.entity';
import { AgendaSettings } from '../../agenda/entities/agenda-settings.entity';
import { Session } from '../../auth/session.entity';
import { Friendship } from '../../friends/friendship.entity';
import { GroupMembership } from '../../groups/group-membership.entity';
import { Group } from '../../groups/group.entity';
import { ListEntry } from '../../lists/entities/list-entry.entity';
import { ListMember } from '../../lists/entities/list-member.entity';
import { ListPreference } from '../../lists/entities/list-preference.entity';
import { ListSection } from '../../lists/entities/list-section.entity';
import { ListSettings } from '../../lists/entities/list-settings.entity';
import { List } from '../../lists/entities/list.entity';
import { ObjectiveActivity } from '../../objectives/entities/objective-activity.entity';
import { ObjectiveComment } from '../../objectives/entities/objective-comment.entity';
import { ObjectiveCheckInRow } from '../../objectives/entities/objective-check-in.entity';
import { ObjectiveMember } from '../../objectives/entities/objective-member.entity';
import { ObjectivePeriod } from '../../objectives/entities/objective-period.entity';
import { ObjectiveTemplate } from '../../objectives/entities/objective-template.entity';
import { ObjectivePreference } from '../../objectives/entities/objective-preference.entity';
import { ObjectiveSession } from '../../objectives/entities/objective-session.entity';
import { ObjectiveSettings } from '../../objectives/entities/objective-settings.entity';
import { Objective } from '../../objectives/entities/objective.entity';
import { Notification } from '../../notifications/notification.entity';
import { User } from '../../users/user.entity';

/** Every entity, for tests that build a DataSource without the Nest modules. */
export const ENTITIES = [
  User,
  Session,
  Group,
  GroupMembership,
  Friendship,
  List,
  ListMember,
  ListSection,
  ListEntry,
  ListSettings,
  ListPreference,
  Objective,
  ObjectiveSession,
  ObjectiveSettings,
  ObjectiveCheckInRow,
  ObjectivePreference,
  ObjectiveMember,
  ObjectiveActivity,
  ObjectiveComment,
  ObjectivePeriod,
  ObjectiveTemplate,
  Notification,
  AgendaEvent,
  AgendaGuest,
  AgendaSettings,
];

export interface TestDatabase {
  url: string;
  drop(): Promise<void>;
}

/**
 * A new, empty database on the PostgreSQL server that Jest's global setup
 * started, so every test bed starts from a clean schema and tests stay isolated.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const serverUrl = process.env.TEST_DATABASE_URL;
  if (!serverUrl) {
    throw new Error(
      'TEST_DATABASE_URL is not set: run the tests through Jest, whose global setup starts PostgreSQL.',
    );
  }

  const name = `plano_test_${randomUUID().replaceAll('-', '')}`;
  await runOnServer(serverUrl, `CREATE DATABASE "${name}"`);

  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: () =>
      runOnServer(serverUrl, `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`),
  };
}

async function runOnServer(serverUrl: string, sql: string): Promise<void> {
  const client = new Client({ connectionString: serverUrl });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
