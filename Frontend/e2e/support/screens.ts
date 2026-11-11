import { expect, type Page } from '@playwright/test';
import { mockApi, type MockOptions } from './mock-api';

export interface Screen {
  name: string;
  url: string;
  mock?: MockOptions;
  /** Brings the screen to the state to check, once it has loaded. */
  act?: (page: Page) => Promise<void>;
  /** Axe rules that do not apply to this state, each with its reason where it is set. */
  axeExceptions?: string[];
}

// Every screen, in each of its states that shows something different.
export const screens: Screen[] = [
  { name: 'sign-in', url: '/login', mock: { signedOut: true } },
  {
    name: 'sign-in cancelled',
    url: '/login?signIn=cancelled',
    mock: { signedOut: true },
  },
  {
    name: 'welcome, terms to accept',
    url: '/welcome',
    mock: { termsPending: true },
  },
  { name: 'terms', url: '/terms', mock: { signedOut: true } },
  { name: 'home', url: '/' },
  { name: 'home of a new account', url: '/', mock: { empty: true } },
  {
    name: 'home, notifications open',
    url: '/',
    act: async (page) => {
      await page.getByRole('button', { name: /^Notifications/ }).click();
      await expect(
        page.getByRole('heading', { name: 'Notifications' }),
      ).toBeVisible();
    },
  },
  {
    name: 'new event with an error',
    url: '/agenda/new',
    act: async (page) => {
      await page
        .getByRole('button', { name: 'Enregistrer l’événement' })
        .click();
    },
  },
  {
    name: 'new objective with an error',
    url: '/objectives/new',
    act: async (page) => {
      await page.getByRole('button', { name: 'Créer l’objectif' }).click();
    },
  },
  {
    name: 'objective, actions open',
    url: '/objectives/obj-1',
    // The open menu covers part of a tab: no target while it is open, a click there closes it.
    axeExceptions: ['target-size'],
    act: async (page) => {
      await page.getByRole('button', { name: 'Actions de l’objectif' }).click();
    },
  },
  { name: 'lists', url: '/lists' },
  { name: 'lists of a new account', url: '/lists', mock: { empty: true } },
  { name: 'list', url: '/lists/list-1' },
  {
    name: 'list, renaming it from its title',
    url: '/lists/list-1',
    act: async (page) => {
      await page.getByRole('button', { name: /^Renommer la liste/ }).click();
      await expect(page.getByRole('textbox', { name: 'Nom de la liste' })).toBeFocused();
    },
  },
  { name: 'list not found', url: '/lists/nope' },
  { name: 'settings', url: '/settings' },
  { name: 'groups', url: '/groups' },
  { name: 'groups of a new account', url: '/groups', mock: { empty: true } },
  { name: 'group', url: '/groups/group-1' },
  { name: 'agenda', url: '/agenda' },
  { name: 'agenda of a new account', url: '/agenda', mock: { empty: true } },
  { name: 'new event', url: '/agenda/new' },
  { name: 'event', url: '/agenda/events/rendez-vous-projet' },
  { name: 'edit event', url: '/agenda/events/rendez-vous-projet/edit' },
  {
    name: 'edit event, picking participants',
    url: '/agenda/events/rendez-vous-projet/edit',
    act: async (page) => {
      await page.getByRole('button', { name: /^Participants/ }).click();
      await expect(page.getByRole('dialog', { name: 'Participants' })).toBeVisible();
      await expect(page.getByRole('checkbox').first()).toBeVisible();
    },
  },
  { name: 'agenda filters', url: '/agenda/filters' },
  { name: 'agenda search', url: '/agenda/search' },
  { name: 'agenda settings', url: '/agenda/settings' },
  { name: 'objectives', url: '/objectives' },
  {
    name: 'objectives of a new account',
    url: '/objectives',
    mock: { empty: true },
  },
  { name: 'new objective', url: '/objectives/new' },
  { name: 'objectives search', url: '/objectives/search' },
  { name: 'objectives filters', url: '/objectives/filters' },
  { name: 'objectives settings', url: '/objectives/settings' },
  { name: 'objective', url: '/objectives/obj-1' },
  { name: 'objective calendar', url: '/objectives/obj-1/calendar' },
  { name: 'objective stats', url: '/objectives/obj-metric/stats' },
  { name: 'objective activity', url: '/objectives/obj-1/activity' },
  { name: 'habit', url: '/objectives/obj-habit/habit' },
  { name: 'share objective', url: '/objectives/obj-1/share' },
  { name: 'edit objective', url: '/objectives/obj-1/edit' },
  { name: 'objective not found', url: '/objectives/nope' },
];

/** Opens the screen with its mocked data and brings it to its state, ready to check. */
export async function openScreen(page: Page, screen: Screen): Promise<void> {
  await mockApi(page, screen.mock);
  await page.goto(screen.url);
  // The launch splash covers the app for two seconds; any key dismisses it, as for a user.
  const splash = page.locator('app-splash-screen');
  await splash.waitFor();
  await page.keyboard.press('Shift');
  await expect(splash).toHaveCount(0);
  await expect(page.locator('h1, h2').first()).toBeAttached();
  await screen.act?.(page);
  await page.waitForLoadState('networkidle');
}
