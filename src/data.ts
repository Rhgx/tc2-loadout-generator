export type Weapon = { name: string; image: string };

export type WeaponSlots = Record<'Primary' | 'Secondary' | 'Melee', Weapon[]> & {
  PDA?: Weapon[];
};

export type WeaponCatalog = Record<string, WeaponSlots>;
export type PartialWeaponCatalog = Record<string, Partial<Record<keyof WeaponSlots, Weapon[]>>>;

export const classPortraits: Record<string, string> = {
  Flanker: 'images/portraits_stare/flankerstare.png',
  Trooper: 'images/portraits_stare/trooperstare.png',
  Arsonist: 'images/portraits_stare/arsoniststare.png',
  Annihilator: 'images/portraits_stare/annihilatorstare.png',
  Brute: 'images/portraits_stare/brutestare.png',
  Mechanic: 'images/portraits_stare/mechanicstare.png',
  Doctor: 'images/portraits_stare/doctorstare.png',
  Marksman: 'images/portraits_stare/marksmanstare.png',
  Agent: 'images/portraits_stare/agentstare.png',
};
