import type { CreateObjectiveRequest } from '@plano/common';
import { DatabaseWriteLockService } from '../../database/database-write-lock.service';
import {
  createListsTestBed,
  type ListsTestBed,
} from '../../lists/testing/lists-test-bed';
import { ObjectiveAccessService } from '../objective-access.service';
import { ObjectiveImportService } from '../objective-import.service';
import { ObjectivePreferencesService } from '../objective-preferences.service';
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
}

/** The lists test bed's people and database, with the objectives services on top. */
export async function createObjectivesTestBed(): Promise<ObjectivesTestBed> {
  const bed = await createListsTestBed();
  const writeLock = new DatabaseWriteLockService();
  const access = new ObjectiveAccessService(bed.dataSource);
  const writer = new ObjectiveWriterService(bed.dataSource, writeLock, access);
  const view = new ObjectiveViewService(bed.dataSource);
  const objectivePreferences = new ObjectivePreferencesService(
    bed.dataSource,
    writeLock,
    access,
    view,
  );
  return {
    ...bed,
    access,
    objectivePreferences,
    objectives: new ObjectivesService(
      access,
      writer,
      view,
      objectivePreferences,
    ),
    tracking: new ObjectiveTrackingService(access, writer, view),
    importer: new ObjectiveImportService(writer),
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
