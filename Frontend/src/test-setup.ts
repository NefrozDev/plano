import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

// t() and tCount() go through the Transloco service the latest TestBed created.
// Create one before each spec file, then reset the TestBed so specs still
// configure their own: specs of plain functions get the French texts too.
beforeAll(() => {
  TestBed.inject(TranslocoService);
  TestBed.resetTestingModule();
});
