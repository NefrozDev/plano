import type { CreateObjectiveRequest } from '@plano/common';
import { DatabaseWriteLockService } from '../../database/database-write-lock.service';
import { ContactsService } from '../../friends/contacts.service';
import { FriendsService } from '../../friends/friends.service';
import { GroupMembership } from '../../groups/group-membership.entity';
import { GroupsService } from '../../groups/groups.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from '../../lists/testing/lists-test-bed';
import { ObjectiveAccessService } from '../objective-access.service';
import { ObjectiveActivityService } from '../objective-activity.service';
import { ObjectiveChangesService } from '../objective-changes.service';
import { ObjectiveAgendaService } from '../objective-agenda.service';
import { ObjectiveImportService } from '../objective-import.service';
import { ObjectiveListsService } from '../objective-lists.service';
import { ObjectiveMembersService } from '../objective-members.service';
import { ObjectivePreferencesService } from '../objective-preferences.service';
import { ObjectiveRecurrenceService } from '../objective-recurrence.service';
import { ObjectiveTemplatesService } from '../objective-templates.service';
import { ObjectiveTrackingService } from '../objective-tracking.service';
import { ObjectiveViewService } from '../objective-view.service';
import { ObjectiveWriterService } from '../objective-writer.service';
import { ObjectivesService } from '../objectives.service';

export interface ObjectivesTestBed extends ListsTestBed {
  objectives: ObjectivesService;
  tracking: ObjectiveTrackingService;
  objectivePreferences: ObjectivePreferencesService;
  importer: ObjectiveImportService;
  access: ObjectiveAccessService;
  members: ObjectiveMembersService;
  activity: ObjectiveActivityService;
  recurrence: ObjectiveRecurrenceService;
  templates: ObjectiveTemplatesService;
  agenda: ObjectiveAgendaService;
  objectiveLists: ObjectiveListsService;
}

/** The lists test bed's people and database, with the objectives services on top. */
export async function createObjectivesTestBed(): Promise<ObjectivesTestBed> {
  const bed = await createListsTestBed();
  const writeLock = new DatabaseWriteLockService();
  const contacts = new ContactsService(
    new GroupsService(
      bed.dataSource.getRepository(GroupMembership),
      bed.dataSource,
      writeLock,
    ),
    new FriendsService(bed.dataSource, writeLock, bed.live, bed.notifications),
  );
  const access = new ObjectiveAccessService(bed.dataSource, contacts);
  const changes = new ObjectiveChangesService(
    bed.dataSource,
    access,
    bed.live,
    bed.notifications,
  );
  const writer = new ObjectiveWriterService(
    bed.dataSource,
    writeLock,
    access,
    changes,
  );
  const view = new ObjectiveViewService(bed.dataSource, bed.listAccess);
  const recurrence = new ObjectiveRecurrenceService(
    bed.dataSource,
    writer,
    access,
    changes,
    bed.listChanges,
  );
  const objectivePreferences = new ObjectivePreferencesService(
    bed.dataSource,
    writeLock,
    access,
    view,
    recurrence,
  );
  const members = new ObjectiveMembersService(
    access,
    writer,
    view,
    contacts,
    changes,
  );
  const objectives = new ObjectivesService(
    access,
    writer,
    view,
    objectivePreferences,
    members,
    changes,
    recurrence,
  );
  const objectiveLists = new ObjectiveListsService(
    bed.dataSource,
    access,
    writer,
    view,
    changes,
    bed.lists,
    bed.listChanges,
    objectives,
  );
  return {
    ...bed,
    objectiveLists,
    destroy: async () => {
      objectiveLists.onModuleDestroy();
      await bed.destroy();
    },
    access,
    members,
    recurrence,
    agenda: new ObjectiveAgendaService(bed.dataSource, access, recurrence),
    templates: new ObjectiveTemplatesService(
      bed.dataSource,
      writeLock,
      access,
      writer,
      objectives,
    ),
    objectivePreferences,
    objectives,
    tracking: new ObjectiveTrackingService(access, writer, view),
    importer: new ObjectiveImportService(writer),
    activity: new ObjectiveActivityService(bed.dataSource, access, writer),
  };
}

/** The settings of a simple objective; override what a test is about. */
export function objectiveDetails(
  changes: Partial<CreateObjectiveRequest> = {},
): CreateObjectiveRequest {
  return {
    title: 'Courir',
    category: 'health',
    completion: 'none',
    startDate: '2026-10-01',
    ...changes,
  };
}
