import type {
  CompletionMode,
  DueReminder,
  MetricAggregation,
  ObjectiveCategory,
  ObjectiveReminder,
  ObjectiveSessionStatus,
  TimelapseMode,
} from '@plano/common';
import { applyDecorators } from '@nestjs/common';
import { IsDateString, Matches } from 'class-validator';

export const OBJECTIVE_CATEGORIES: readonly ObjectiveCategory[] = [
  'health',
  'learning',
  'finance',
  'development',
  'other',
];
export const COMPLETION_MODES: readonly CompletionMode[] = [
  'none',
  'children',
  'metric',
  'habit',
  'manual',
];
export const TIMELAPSE_MODES: readonly TimelapseMode[] = [
  'off',
  'elapsed',
  'remaining',
];
export const METRIC_AGGREGATIONS: readonly MetricAggregation[] = ['sum', 'max'];
export const SESSION_STATUSES: readonly ObjectiveSessionStatus[] = [
  'done',
  'planned',
  'missed',
  'rest',
];
export const REMINDER_FREQUENCIES: readonly ObjectiveReminder['frequency'][] = [
  'none',
  'daily',
  'weekly',
];
export const DUE_REMINDERS: readonly DueReminder[] = [
  'none',
  'same-day',
  'day-before',
  'week-before',
];
export const REMINDER_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A real calendar day written `YYYY-MM-DD`. */
export function IsIsoDate(options?: { each?: boolean }): PropertyDecorator {
  return applyDecorators(
    Matches(/^\d{4}-\d{2}-\d{2}$/, options),
    IsDateString({ strict: true }, options),
  );
}
