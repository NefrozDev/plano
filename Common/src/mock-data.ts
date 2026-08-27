import type {
  ListDetail,
  ListEntry,
  PlanoData,
  PlanoList,
} from './models';

const lists: PlanoList[] = [
  { slug: 'courses', name: 'Courses', detail: 'Partagée avec 2 personnes', completed: 3, total: 8, icon: 'cart', color: '#2ecb70', surface: '#f0fff5', ownership: 'shared' },
  { slug: 'maison', name: 'Maison', detail: 'Partagée avec 2 personnes', completed: 5, total: 12, icon: 'home', color: '#7868ef', surface: '#f7f4ff', ownership: 'shared' },
  { slug: 'vacances-ete', name: 'Vacances été', detail: 'Partagée avec 3 personnes', completed: 8, total: 15, icon: 'suitcase', color: '#f4a51c', surface: '#fff9ec', ownership: 'shared' },
  { slug: 'idees-cadeaux', name: 'Idées cadeaux', detail: 'Privée', completed: 4, total: 10, icon: 'gift', color: '#e65591', surface: '#fff1f7', ownership: 'mine' },
  { slug: 'projets-maison', name: 'Projets maison', detail: 'Privée', completed: 2, total: 6, icon: 'tools', color: '#3978ed', surface: '#f1f6ff', ownership: 'mine' },
];

function entry(id: string, name: string, done = false, extras: Partial<ListEntry> = {}): ListEntry {
  return {
    id,
    name,
    done,
    addedBy: 'Camille',
    addedAt: '13 août 2024 à 11:20',
    assignedTo: 'Alex',
    reminder: '',
    notes: '',
    ...extras,
  };
}

const courses: ListDetail = {
  description: '',
  sharingEnabled: true,
  total: 8,
  members: [
    { id: 'camille', name: 'Camille', initials: 'C', color: '#A76142', role: 'owner' },
    { id: 'alex', name: 'Alex', initials: 'A', color: '#D07863', role: 'editor' },
    { id: 'emma', name: 'Emma', initials: 'E', color: '#3D6F83', role: 'viewer' },
  ],
  sections: [
    { id: 'fresh', name: 'Produits frais', color: '#23c666', entries: [entry('milk', 'Lait'), entry('eggs', 'Œufs', true), entry('tomatoes', 'Tomates'), entry('salad', 'Salade')] },
    { id: 'grocery', name: 'Épicerie', color: '#d85a9a', entries: [entry('pasta', 'Pâtes', true), entry('rice', 'Riz', false, { highlighted: true }), entry('oil', 'Huile d’olive')] },
    { id: 'drinks', name: 'Boissons', color: '#3899e8', entries: [entry('water', 'Eau'), entry('juice', 'Jus d’orange')] },
    { id: 'cleaning', name: 'Hygiène & Entretien', color: '#5364ee', entries: [entry('detergent', 'Lessive', true), entry('sponges', 'Éponges'), entry('cleaner', 'Nettoyant')] },
  ],
};

const emptyDetail = (): ListDetail => ({
  description: '',
  sharingEnabled: false,
  total: 0,
  members: [{ id: 'camille', name: 'Camille', initials: 'C', color: '#A76142', role: 'owner' }],
  sections: [],
});

const seed: PlanoData = {
  version: 1,
  lists,
  listDetails: {
    courses,
    maison: emptyDetail(),
    'vacances-ete': emptyDetail(),
    'idees-cadeaux': emptyDetail(),
    'projets-maison': emptyDetail(),
  },
  listSettings: {
    defaultView: 'list',
    showCounts: true,
    showCompleted: true,
    completedLast: true,
    defaultReminder: '09:00',
    notifyScope: 'mine',
    archiveCompleted: false,
    confirmDelete: true,
  },
  dashboard: {
    weekDays: [
      { label: 'lun', date: 17 }, { label: 'mar', date: 18 },
      { label: 'mer', date: 19 }, { label: 'jeu', date: 20, selected: true },
      { label: 'ven', date: 21, hasEvent: true }, { label: 'sam', date: 22 },
      { label: 'dim', date: 23, hasEvent: true },
    ],
    tasks: [
      { id: 'presentation', label: 'Préparer la présentation', done: false },
      { id: 'running', label: '30 minutes de course à pied', done: true },
      { id: 'restaurant', label: 'Réserver le restaurant', done: false },
    ],
  },
};

export function createMockPlanoData(): PlanoData {
  return structuredClone(seed);
}
