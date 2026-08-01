import { useCallback, useEffect, useRef, useState } from 'react';
import { classPortraits, type Weapon, type WeaponCatalog } from './data';
import type { WeaponSlots } from './data';
import { experimentalWeapons } from './data/experimental.generated';
import { weapons } from './data/weapons.generated';
import { useSecretRoute } from './useSecretRoute';
import { FracturedCredit } from './FracturedCredit';

const classes = [...Object.keys(classPortraits), 'Random'];
const backgrounds = [
  '3cp_citrus', 'ad_cliffhanger', 'ad_deadfall_ridge', 'ad_gorge',
  'ad_yellowvalley', 'ctf_doublefort', 'koth_bagel', 'koth_harvest', 'tr_target',
];

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const choose = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const experimentalCatalog: WeaponCatalog = Object.fromEntries(Object.entries(weapons).map(([className, slots]) => {
  const additions = experimentalWeapons[className] || {};
  const merged = Object.fromEntries(Object.entries(slots).map(([slot, items]) => [
    slot,
    [...items, ...(additions[slot as keyof WeaponSlots] || [])],
  ])) as unknown as WeaponSlots;
  return [className, merged];
}));
const experimentalNames = new Set(
  Object.values(experimentalWeapons).flatMap((slots) => Object.values(slots).flatMap((items) => items?.map((item) => item.name) || [])),
);

type Loadout = {
  className: string;
  Primary: Weapon;
  Secondary: Weapon;
  Melee: Weapon;
  PDA?: Weapon;
};

function iconPath(className: string) {
  return className === 'Random'
    ? asset('images/questionClass.png')
    : asset(`images/icons/${className.toLowerCase()}transparent.png`);
}

function WeaponCard({ weapon, changing, experimental }: { weapon: Weapon; changing: boolean; experimental: boolean }) {
  return (
    <div className={`item-container${changing ? ' changing' : ''}`}>
      <img src={asset(weapon.image)} alt={weapon.name} draggable={false} />
      <p className={experimental ? 'experimental-weapon' : undefined}>{weapon.name}</p>
    </div>
  );
}

type LoadoutGeneratorProps = {
  catalog: WeaponCatalog;
  title?: string;
  experimentalNames?: ReadonlySet<string>;
  requireExperimental?: boolean;
  navigation?: { label: string; onClick: () => void };
  onCreditsUnlock?: (finished: Promise<void>) => void;
};

export function LoadoutGenerator({
  catalog,
  title = 'TC2 Random Loadout Generator',
  experimentalNames = new Set<string>(),
  requireExperimental = false,
  navigation,
  onCreditsUnlock,
}: LoadoutGeneratorProps) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [changing, setChanging] = useState(false);
  const [loading, setLoading] = useState(true);
  const lastGeneratedAt = useRef(0);
  const loadoutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = asset(`images/backgrounds/${choose(backgrounds)}.png`);
    document.body.style.backgroundImage = `url('${background}')`;

    const urls = new Set<string>([background]);
    classes.forEach((className) => urls.add(iconPath(className)));
    Object.entries(classPortraits).forEach(([className, portrait]) => {
      urls.add(asset(portrait));
      Object.values(catalog[className]).forEach((items) => {
        items?.forEach((weapon) => urls.add(asset(weapon.image)));
      });
    });

    Promise.allSettled([...urls].map((url) => new Promise<void>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve();
      image.onerror = () => reject();
      image.src = url;
    }))).finally(() => setLoading(false));
  }, [catalog]);

  const generate = useCallback(() => {
    const now = Date.now();
    if (now - lastGeneratedAt.current < 500) return;
    lastGeneratedAt.current = now;
    if (!selectedClass) {
      window.alert('Please select a class first!');
      return;
    }

    const className = selectedClass === 'Random' ? choose(Object.keys(classPortraits)) : selectedClass;
    const slots = catalog[className];
    setChanging(true);
    window.setTimeout(() => {
      const nextLoadout: Loadout = {
        className,
        Primary: choose(slots.Primary),
        Secondary: choose(slots.Secondary),
        Melee: choose(slots.Melee),
        ...(slots.PDA ? { PDA: choose(slots.PDA) } : {}),
      };
      if (requireExperimental) {
        const candidates = Object.entries(slots).flatMap(([slot, items]) => (
          items.filter((weapon) => experimentalNames.has(weapon.name)).map((weapon) => ({ slot, weapon }))
        ));
        const required = choose(candidates);
        if (required) {
          if (required.slot === 'Primary') nextLoadout.Primary = required.weapon;
          if (required.slot === 'Secondary') nextLoadout.Secondary = required.weapon;
          if (required.slot === 'Melee') nextLoadout.Melee = required.weapon;
          if (required.slot === 'PDA') nextLoadout.PDA = required.weapon;
        }
      }
      setLoadout(nextLoadout);
      setChanging(false);
      window.setTimeout(() => loadoutRef.current?.scrollIntoView({ behavior: 'smooth' }), 0);
    }, loadout ? 300 : 0);
  }, [catalog, experimentalNames, loadout, requireExperimental, selectedClass]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const directions = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (directions.includes(event.code)) {
        event.preventDefault();
        const current = selectedClass ? classes.indexOf(selectedClass) : -1;
        const width = 5;
        let next = current < 0 ? 0 : current;
        if (event.code === 'ArrowLeft') next = current > 0 ? current - 1 : classes.length - 1;
        if (event.code === 'ArrowRight') next = current < classes.length - 1 ? current + 1 : 0;
        if (event.code === 'ArrowUp') next = (current - width + classes.length) % classes.length;
        if (event.code === 'ArrowDown') next = (current + width) % classes.length;
        setSelectedClass(classes[next]);
      } else if (event.code === 'Space' || event.code === 'Enter') {
        event.preventDefault();
        generate();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [generate, selectedClass]);

  return (
    <>
      {loading && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-content"><div className="loading-spinner" /><div id="loading-progress">Loading assets…</div></div>
        </div>
      )}
      <div className="credits">Site : {onCreditsUnlock ? <FracturedCredit onShatter={onCreditsUnlock} /> : 'Rocks'}<br />Class Portraits : Alyssa<br />Weapon Icons : TC2 Wiki</div>
      <main className="container py-5">
        {navigation && <button className="btn experimental-btn" type="button" onClick={navigation.onClick}>{navigation.label}</button>}
        <h1 className="text-center mb-4">{title}</h1>
        <div className="class-container-wrapper">
          <div className="class-container mb-4">
            <div className="class-icons">
              {classes.map((className) => (
                <button
                  className="btn btn-dark"
                  type="button"
                  key={className}
                  onClick={() => setSelectedClass(className)}
                  aria-label={`Select ${className}`}
                  aria-pressed={selectedClass === className}
                >
                  <img className={`class-icon${selectedClass === className ? ' selected' : ''}`} src={iconPath(className)} alt={className} draggable={false} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="text-center mb-4"><button className="btn btn-success btn-gen" type="button" onClick={generate}>Generate</button></div>
        {loadout && (
          <div ref={loadoutRef} className="loadout-container show" style={{ display: 'block' }}>
            <p className="class-name">Your loadout for {loadout.className} is..</p>
            <div className="row">
              <div className="col"><div className="portrait"><img className={`class-portrait${changing ? ' changing' : ''}`} src={asset(classPortraits[loadout.className])} alt={loadout.className} draggable={false} /></div></div>
              <div className="col">
                <WeaponCard weapon={loadout.Primary} changing={changing} experimental={experimentalNames.has(loadout.Primary.name)} />
                <WeaponCard weapon={loadout.Secondary} changing={changing} experimental={experimentalNames.has(loadout.Secondary.name)} />
                <WeaponCard weapon={loadout.Melee} changing={changing} experimental={experimentalNames.has(loadout.Melee.name)} />
                {loadout.PDA && <WeaponCard weapon={loadout.PDA} changing={changing} experimental={experimentalNames.has(loadout.PDA.name)} />}
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

export default function App() {
  const secretAudio = useRef<HTMLAudioElement | null>(null);
  const unlocking = useRef(false);
  const [experimentalMode, setExperimentalMode] = useState(false);

  useEffect(() => {
    const audio = new Audio(`${import.meta.env.BASE_URL}audio/breaking-glass.mp3`);
    audio.preload = 'auto';
    audio.load();
    secretAudio.current = audio;
    return () => {
      audio.pause();
      secretAudio.current = null;
    };
  }, []);

  const activateExperimentalMode = useCallback((visualFinished: Promise<void> = Promise.resolve()) => {
    if (experimentalMode || unlocking.current) return;
    unlocking.current = true;
    const audio = secretAudio.current ?? new Audio(`${import.meta.env.BASE_URL}audio/breaking-glass.mp3`);
    audio.currentTime = 0;
    audio.preservesPitch = false;
    audio.playbackRate = 0.9 + Math.random() * 0.2;
    let finishAudio!: () => void;
    const audioFinished = new Promise<void>((resolve) => { finishAudio = resolve; });
    const enterExperimentalMode = () => {
      finishAudio();
    };
    void Promise.all([visualFinished, audioFinished]).then(() => {
      unlocking.current = false;
      setExperimentalMode(true);
    });
    audio.addEventListener('ended', enterExperimentalMode, { once: true });
    audio.addEventListener('error', enterExperimentalMode, { once: true });
    void audio.play().catch(enterExperimentalMode);
  }, [experimentalMode]);
  useSecretRoute(activateExperimentalMode);
  return experimentalMode ? (
    <LoadoutGenerator
      key="experimental"
      catalog={experimentalCatalog}
      title="TC2 Experimental Loadout Generator"
      experimentalNames={experimentalNames}
      requireExperimental
      navigation={{ label: 'Return to Main Page', onClick: () => setExperimentalMode(false) }}
    />
  ) : <LoadoutGenerator key="normal" catalog={weapons} onCreditsUnlock={activateExperimentalMode} />;
}
