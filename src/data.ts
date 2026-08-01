export type Weapon = { name: string; image: string };

export type WeaponSlots = Record<'Primary' | 'Secondary' | 'Melee', Weapon[]> & {
  PDA?: Weapon[];
};

export type WeaponCatalog = Record<string, WeaponSlots>;
export type PartialWeaponCatalog = Record<string, Partial<Record<keyof WeaponSlots, Weapon[]>>>;

export const classPortraits: Record<string, string> = {
  Flanker: 'images/portraits_stare/flankerstare.webp',
  Trooper: 'images/portraits_stare/trooperstare.webp',
  Arsonist: 'images/portraits_stare/arsoniststare.webp',
  Annihilator: 'images/portraits_stare/annihilatorstare.webp',
  Brute: 'images/portraits_stare/brutestare.webp',
  Mechanic: 'images/portraits_stare/mechanicstare.webp',
  Doctor: 'images/portraits_stare/doctorstare.webp',
  Marksman: 'images/portraits_stare/marksmanstare.webp',
  Agent: 'images/portraits_stare/agentstare.webp',
};
