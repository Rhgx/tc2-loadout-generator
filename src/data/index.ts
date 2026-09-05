export type Weapon = { name: string; image: string; stock?: boolean };

export type WeaponSlots = Record<'Primary' | 'Secondary' | 'Melee', Weapon[]> & {
  PDA?: Weapon[];
};

export type WeaponCatalog = Record<string, WeaponSlots>;
export type PartialWeaponCatalog = Record<string, Partial<Record<keyof WeaponSlots, Weapon[]>>>;

export const classPortraits: Record<string, string> = {
  Flanker: 'images/classes/portraits/flankerstare.webp',
  Trooper: 'images/classes/portraits/trooperstare.webp',
  Arsonist: 'images/classes/portraits/arsoniststare.webp',
  Annihilator: 'images/classes/portraits/annihilatorstare.webp',
  Brute: 'images/classes/portraits/brutestare.webp',
  Mechanic: 'images/classes/portraits/mechanicstare.webp',
  Doctor: 'images/classes/portraits/doctorstare.webp',
  Marksman: 'images/classes/portraits/marksmanstare.webp',
  Agent: 'images/classes/portraits/agentstare.webp',
};
