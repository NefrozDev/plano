import type { ListIcon } from '@plano/common';

/** A circle as a path, so every icon is a list of paths. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export interface ListIconShape {
  /** Read out to screen readers in the picker. */
  label: string;
  /** Stroked paths on a 32 × 32 grid. */
  paths: readonly string[];
}

/** Every icon a list can take; a `Record` so a new `ListIcon` cannot be left undrawn. */
export const LIST_ICON_SHAPES: Readonly<Record<ListIcon, ListIconShape>> = {
  cart: { label: 'Courses', paths: ['M4 6h4l2.5 14h13l3-10H9', circle(13, 25, 1.5), circle(23, 25, 1.5)] },
  basket: { label: 'Panier', paths: ['M5 13h22l-2.5 13h-17Z', 'M10 13l4-7M22 13l-4-7', 'M12 17v5M16 17v5M20 17v5'] },
  home: { label: 'Maison', paths: ['m5 15 11-9 11 9v12H5Z', 'M13 27v-8h6v8'] },
  kitchen: { label: 'Cuisine', paths: ['M6 14h20v9a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4Z', 'M3 14h3M26 14h3', 'M12 14v-3h8v3'] },
  cleaning: { label: 'Ménage', paths: ['M12 12h8l1 15H11Z', 'M13 12V8h6v4', 'M19 8h4l1 3', 'M13 8l-2-3h7'] },
  laundry: { label: 'Linge', paths: ['M11 5 5 9l3 5 3-2v15h10V12l3 2 3-5-6-4a5 5 0 0 1-10 0Z'] },
  plant: {
    label: 'Plantes',
    paths: ['M10 20h12l-2 7h-8Z', 'M16 20v-6', 'M16 14c0-4 3-7 8-7 0 5-3 7-8 7Z', 'M16 16c0-3-2-5-6-5 0 4 2 5 6 5Z'],
  },
  tools: { label: 'Travaux', paths: ['M20 5a7 7 0 0 0-8 9L5 21a3 3 0 0 0 4 4l7-7a7 7 0 0 0 9-8l-5 5-4-4Z'] },
  key: { label: 'Clés', paths: [circle(10, 16, 5), 'M15 16h13M24 16v4M28 16v3'] },

  food: { label: 'Repas', paths: ['M9 4v9a3 3 0 0 0 6 0V4M12 4v24', 'M22 28V4c-3 2-4 6-4 11h4'] },
  apple: {
    label: 'Fruits',
    paths: ['M16 9c-3-2-10-2-10 6 0 7 4 12 7 12 1.5 0 2-1 3-1s1.5 1 3 1c3 0 7-5 7-12 0-8-7-8-10-6Z', 'M16 9c0-3 1-5 3-6'],
  },
  coffee: { label: 'Café', paths: ['M6 12h16v8a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6Z', 'M22 14h2a3 3 0 0 1 0 6h-2', 'M11 4v4M16 4v4'] },
  wine: { label: 'Apéro', paths: ['M10 4h12v6a6 6 0 0 1-12 0Z', 'M16 16v10M11 28h10'] },
  cake: {
    label: 'Gâteau',
    paths: ['M6 17h20v10H6Z', 'M6 21c3 2 5 2 7 0s4-2 6 0 4 2 7 0', 'M11 17v-4M16 17v-4M21 17v-4', 'M11 9v1M16 9v1M21 9v1'],
  },

  suitcase: {
    label: 'Voyage',
    paths: ['M7 10h18a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V12a2 2 0 0 1 2-2Z', 'M12 10V7h8v3M10 14v9M22 14v9'],
  },
  plane: {
    label: 'Avion',
    paths: ['M28 5c-1-1-3 0-4 1l-5 5-11-3-2 2 9 5-4 4-4-1-1 1 4 3 3 4 1-1-1-4 4-4 5 9 2-2-3-11 5-5c1-1 2-3 1-4Z'],
  },
  car: { label: 'Voiture', paths: ['M5 21v-5l3-6h16l3 6v5Z', 'M5 21v3h4v-3M23 21v3h4v-3', 'M5 16h22', 'M9 18.5h2M21 18.5h2'] },
  map: { label: 'Carte', paths: ['M4 8l8-3 8 3 8-3v19l-8 3-8-3-8 3Z', 'M12 5v19M20 8v19'] },
  tent: { label: 'Camping', paths: ['M4 26 16 6l12 20Z', 'M12 26l4-7 4 7', 'M3 26h26'] },
  beach: { label: 'Plage', paths: ['M4 15a12 12 0 0 1 24 0Z', 'M16 15v10a3 3 0 0 1-6 0', 'M16 3v2'] },
  camera: { label: 'Photos', paths: ['M5 11h5l2-3h8l2 3h5v15H5Z', circle(16, 18, 5)] },

  gift: {
    label: 'Cadeaux',
    paths: [
      'M5 12h22v15H5Z',
      'M4 12h24v-5H4ZM16 7v20M16 7c-5 0-7-1-7-3 0-3 6-2 7 3Zm0 0c5 0 7-1 7-3 0-3-6-2-7 3Z',
    ],
  },
  party: { label: 'Fête', paths: ['M16 4c-5 0-8 4-8 8 0 5 4 9 8 9s8-4 8-9c0-4-3-8-8-8Z', 'M16 21l-1.5 2h3Z', 'M16 23c-2 2 2 3 0 6'] },
  music: { label: 'Musique', paths: ['M12 23V7l14-3v16', circle(9, 23, 3), circle(23, 20, 3)] },
  book: { label: 'Lecture', paths: ['M5 6h8a3 3 0 0 1 3 3v18a3 3 0 0 0-3-3H5Z', 'M27 6h-8a3 3 0 0 0-3 3v18a3 3 0 0 1 3-3h8Z'] },
  film: { label: 'Films', paths: ['M5 7h22v18H5Z', 'M10 7v18M22 7v18M5 12h5M5 20h5M22 12h5M22 20h5'] },
  game: {
    label: 'Jeux',
    paths: [
      'M9 11h14a5 5 0 0 1 5 5l1 6a3 3 0 0 1-5 2l-3-3H11l-3 3a3 3 0 0 1-5-2l1-6a5 5 0 0 1 5-5Z',
      'M10 14v4M8 16h4',
      'M21 15h.01M23 17h.01',
    ],
  },
  sport: { label: 'Sport', paths: ['M4 13v6M8 10v12M24 10v12M28 13v6M8 16h16'] },
  bike: { label: 'Vélo', paths: [circle(8, 21, 5), circle(24, 21, 5), 'M8 21l5-10h7l4 10M13 11l3 10 4-10M11 8h4'] },

  briefcase: { label: 'Travail', paths: ['M5 11h22v15H5Z', 'M12 11V7h8v4', 'M5 17h22'] },
  laptop: { label: 'Ordinateur', paths: ['M7 8h18v12H7Z', 'M3 24h26'] },
  pencil: { label: 'Écriture', paths: ['M21 5l6 6L12 26H6v-6Z', 'M18 8l6 6'] },
  school: { label: 'École', paths: ['M2 12l14-6 14 6-14 6Z', 'M8 15v6c0 2 4 4 8 4s8-2 8-4v-6', 'M28 13v7'] },
  idea: { label: 'Idées', paths: ['M12 21c0-3-4-5-4-10a8 8 0 0 1 16 0c0 5-4 7-4 10Z', 'M12 25h8M13 28h6'] },
  calendar: { label: 'Rendez-vous', paths: ['M5 7h22v20H5Z', 'M5 13h22M11 4v5M21 4v5'] },
  chart: { label: 'Projets', paths: ['M5 5v22h22', 'M10 21v-5M16 21V10M22 21v-8'] },

  pill: { label: 'Santé', paths: ['M7 19 19 7a5 5 0 0 1 7 7L14 26a5 5 0 0 1-7-7Z', 'M13 13l6 6'] },
  heart: { label: 'Cœur', paths: ['M16 27S4 20 4 11a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 9-12 16-12 16Z'] },
  baby: {
    label: 'Bébé',
    paths: ['M12 11h8v14a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3Z', 'M13 11V8h6v3', 'M14 8l1-4h2l1 4', 'M12 16h3M12 20h3'],
  },
  paw: { label: 'Animaux', paths: [circle(16, 21, 5), circle(8, 14, 2), circle(13, 8, 2), circle(19, 8, 2), circle(24, 14, 2)] },

  wallet: { label: 'Budget', paths: ['M5 9h20v18H5Z', 'M5 9l15-4v4', 'M19 16h6v5h-6Z'] },
  piggy: {
    label: 'Épargne',
    paths: [
      'M7 15c0-5 5-7 9-7 6 0 10 3 10 8 0 3-2 5-3 6v4h-4v-2h-6v2H9v-4c-2-1-3-3-3-5H4v-4h3Z',
      'M14 8l-2-3',
      'M20 14h.01',
    ],
  },

  star: { label: 'Favoris', paths: ['M16 4l3.7 7.5 8.3 1.2-6 5.8 1.4 8.3-7.4-3.9-7.4 3.9 1.4-8.3-6-5.8 8.3-1.2Z'] },
  flag: { label: 'Objectifs', paths: ['M7 28V4', 'M7 5h17l-4 6 4 6H7'] },
  check: { label: 'Tâches', paths: ['M13 8h14M13 16h14M13 24h14', 'M4 8l2 2 4-4M4 16l2 2 4-4M4 24l2 2 4-4'] },
  bell: { label: 'Rappels', paths: ['M8 22h16l-2-3v-6a6 6 0 0 0-12 0v6Z', 'M14 26h4'] },
  phone: { label: 'Téléphone', paths: ['M10 3h12v26H10Z', 'M15 25h2'] },
};

/** The full picker, by theme. Its first line is what the list editor shows before "+". */
export const LIST_ICON_GROUPS: readonly { label: string; icons: readonly ListIcon[] }[] = [
  { label: 'Courses et maison', icons: ['cart', 'basket', 'home', 'kitchen', 'cleaning', 'laundry', 'plant', 'tools', 'key'] },
  { label: 'Cuisine et repas', icons: ['food', 'apple', 'coffee', 'wine', 'cake'] },
  { label: 'Voyages et sorties', icons: ['suitcase', 'plane', 'car', 'map', 'tent', 'beach', 'camera'] },
  { label: 'Loisirs et fêtes', icons: ['gift', 'party', 'music', 'book', 'film', 'game', 'sport', 'bike'] },
  { label: 'Travail et études', icons: ['briefcase', 'laptop', 'pencil', 'school', 'idea', 'calendar', 'chart'] },
  { label: 'Santé et famille', icons: ['pill', 'heart', 'baby', 'paw'] },
  { label: 'Argent', icons: ['wallet', 'piggy'] },
  { label: 'Divers', icons: ['star', 'flag', 'check', 'bell', 'phone'] },
];

/** What the list editor shows before its "+": the first line of the full picker. */
export const FIRST_LINE_SIZE = 5;
