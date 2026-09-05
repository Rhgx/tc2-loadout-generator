import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { classPortraits, type Weapon, type WeaponCatalog, type WeaponSlots } from './data';
import { qualityColors, weaponQualities } from './data/weaponQualities';
import { experimentalWeapons } from './data/experimental.generated';
import { weapons } from './data/weapons.generated';
import { useSecretRoute } from './hooks/useSecretRoute';
import { FracturedCredit } from './components/FracturedCredit';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { GridBackground } from './components/GridBackground';
import { preloadImage, warmImages } from './lib/imageLoading';

const classes = [...Object.keys(classPortraits), 'Random'];
const backgrounds = [
  '3cp_citrus',
  'ad_cliffhanger',
  'ad_deadfall_ridge',
  'ad_gorge',
  'ad_yellowvalley',
  'ctf_doublefort',
  'koth_bagel',
  'koth_harvest',
  'tr_target',
];

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;
const choose = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];
const emptyExperimentalNames: ReadonlySet<string> = new Set();
const generationDurationMs = 360;
const itemDimDurationMs = 70;
const optionalSlotFadeMs = 180;
const portraitFadeMs = 200;
const optionalSlotStyle: CSSProperties & { '--slot-fade-duration': string } = {
  // Keep the CSS fade and delayed unmount on the same clock.
  '--slot-fade-duration': `${optionalSlotFadeMs}ms`,
};
const experimentalCatalog: WeaponCatalog = Object.fromEntries(
  Object.entries(weapons).map(([className, slots]) => {
    const additions = experimentalWeapons[className] || {};
    const merged: WeaponSlots = {
      Primary: [...slots.Primary, ...(additions.Primary ?? [])],
      Secondary: [...slots.Secondary, ...(additions.Secondary ?? [])],
      Melee: [...slots.Melee, ...(additions.Melee ?? [])],
      ...(slots.PDA ? { PDA: [...slots.PDA, ...(additions.PDA ?? [])] } : {}),
    };
    return [className, merged];
  }),
);
const experimentalNames = new Set(
  Object.values(experimentalWeapons).flatMap((slots) =>
    Object.values(slots).flatMap((items) => items?.map((item) => item.name) || []),
  ),
);

type Loadout = {
  className: string;
  Primary: Weapon;
  Secondary: Weapon;
  Melee: Weapon;
  PDA?: Weapon;
};

function chooseLoadout(
  className: string,
  slots: WeaponSlots,
  experimentalNames: ReadonlySet<string>,
  requireExperimental: boolean,
): Loadout {
  const loadout: Loadout = {
    className,
    Primary: choose(slots.Primary),
    Secondary: choose(slots.Secondary),
    Melee: choose(slots.Melee),
    ...(slots.PDA ? { PDA: choose(slots.PDA) } : {}),
  };
  if (requireExperimental) {
    const candidates = Object.entries(slots).flatMap(([slot, items]) =>
      items
        .filter((weapon) => experimentalNames.has(weapon.name))
        .map((weapon) => ({ slot, weapon })),
    );
    const required = choose(candidates);
    if (required) {
      if (required.slot === 'Primary') loadout.Primary = required.weapon;
      if (required.slot === 'Secondary') loadout.Secondary = required.weapon;
      if (required.slot === 'Melee') loadout.Melee = required.weapon;
      if (required.slot === 'PDA') loadout.PDA = required.weapon;
    }
  }
  return loadout;
}

function iconPath(className: string) {
  return className === 'Random'
    ? asset('images/classes/icons/random.svg')
    : asset(`images/classes/icons/${className.toLowerCase()}transparent.png`);
}

function WeaponCard({
  slot,
  weapon,
  delay,
  experimental,
}: {
  slot: string;
  weapon: Weapon;
  delay: number;
  experimental: boolean;
}) {
  const [displayed, setDisplayed] = useState({ weapon, experimental });
  const [phase, setPhase] = useState('revealing');
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayed({ weapon, experimental });
      setPhase('idle');
      return;
    }
    setPhase('dimming');
    const reveal = window.setTimeout(() => {
      setDisplayed({ weapon, experimental });
      setPhase('revealing');
    }, itemDimDurationMs + delay);
    return () => window.clearTimeout(reveal);
  }, [weapon, experimental, delay]);
  const quality = displayed.experimental
    ? 'experimental'
    : displayed.weapon.stock
      ? 'stock'
      : weaponQualities[displayed.weapon.name] ?? 'unique';
  const style: CSSProperties & { '--quality-color': string } = {
    '--quality-color': qualityColors[quality],
  };
  return (
    <article
      aria-label={`${slot}: ${displayed.weapon.name}`}
      className={`item-container ${phase}`}
      style={style}
    >
      <h3>
        <span>{displayed.weapon.name}</span>
      </h3>
      <div className="weapon-image">
        <img src={asset(displayed.weapon.image)} alt="" draggable={false} decoding="async" />
      </div>
    </article>
  );
}

function OptionalWeaponCard({ weapon, experimental }: { weapon?: Weapon; experimental: boolean }) {
  // Retain the outgoing PDA long enough to fade when switching away from Agent.
  const [retained, setRetained] = useState({ weapon, experimental });
  useEffect(() => {
    if (weapon || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRetained({ weapon, experimental });
      return;
    }
    const timer = window.setTimeout(
      () => setRetained({ weapon: undefined, experimental: false }),
      optionalSlotFadeMs,
    );
    return () => window.clearTimeout(timer);
  }, [weapon, experimental]);
  const visibleWeapon = weapon ?? retained.weapon;
  if (!visibleWeapon) return null;
  return (
    <div
      className={`optional-slot${weapon ? '' : ' leaving'}`}
      aria-hidden={!weapon}
      style={optionalSlotStyle}
    >
      <WeaponCard
        slot="PDA"
        weapon={visibleWeapon}
        delay={105}
        experimental={weapon ? experimental : retained.experimental}
      />
    </div>
  );
}

function Portrait({ className }: { className: string }) {
  const lastClass = useRef(className);
  const [previous, setPrevious] = useState<string | null>(null);
  useEffect(() => {
    if (lastClass.current === className) return;
    setPrevious(matchMedia('(prefers-reduced-motion: reduce)').matches ? null : lastClass.current);
    lastClass.current = className;
    const timer = window.setTimeout(() => setPrevious(null), portraitFadeMs);
    return () => window.clearTimeout(timer);
  }, [className]);
  return (
    <div className="portrait">
      <div className="portrait-images">
        {previous && (
          <img
            className="class-portrait portrait-previous"
            src={asset(classPortraits[previous])}
            alt=""
            aria-hidden="true"
          />
        )}
        <img
          key={className}
          className="class-portrait portrait-current"
          src={asset(classPortraits[className])}
          alt={className}
          draggable={false}
        />
      </div>
      <h2>{className}</h2>
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
  experimentalNames = emptyExperimentalNames,
  requireExperimental = false,
  navigation,
  onCreditsUnlock,
}: LoadoutGeneratorProps) {
  const [selectedClass, setSelectedClass] = useState<string | null>(null);
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isLoadingAssets, setIsLoadingAssets] = useState(true);
  const lastGeneratedAt = useRef(0);
  const classIconsRef = useRef<HTMLDivElement>(null);
  const generationTimer = useRef<number | undefined>(undefined);
  const generationId = useRef(0);
  useEffect(
    () => () => {
      window.clearTimeout(generationTimer.current);
      // Pending image loads must not update a generator that has been replaced.
      generationId.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (!selectedClass) return;
    const names = selectedClass === 'Random' ? Object.keys(classPortraits) : [selectedClass];
    const urls = [
      ...new Set(
        names.flatMap((name) => [
          asset(classPortraits[name]),
          ...Object.values(catalog[name]).flatMap((items) =>
            items.map((weapon) => asset(weapon.image)),
          ),
        ]),
      ),
    ];
    return warmImages(urls);
  }, [catalog, selectedClass]);

  useEffect(() => {
    const background = asset(`images/backgrounds/${choose(backgrounds)}.webp`);
    document.body.style.backgroundImage = `url('${background}')`;

    const urls = new Set<string>([background]);
    classes.forEach((className) => urls.add(iconPath(className)));

    Promise.all([...urls].map(preloadImage)).finally(() => setIsLoadingAssets(false));
  }, []);

  const generate = useCallback(async () => {
    const now = Date.now();
    if (isGenerating || now - lastGeneratedAt.current < generationDurationMs) return;
    lastGeneratedAt.current = now;
    if (!selectedClass) return;

    const className =
      selectedClass === 'Random' ? choose(Object.keys(classPortraits)) : selectedClass;
    const slots = catalog[className];
    setIsGenerating(true);
    const request = ++generationId.current;
    setRotation((value) => value + 360);
    const nextLoadout = chooseLoadout(className, slots, experimentalNames, requireExperimental);
    // Reveal the loadout together, rather than letting individual images arrive late.
    await Promise.all([
      preloadImage(asset(classPortraits[className])),
      ...[nextLoadout.Primary, nextLoadout.Secondary, nextLoadout.Melee, nextLoadout.PDA]
        .filter((weapon) => weapon !== undefined)
        .map((weapon) => preloadImage(asset(weapon.image))),
    ]);
    if (request !== generationId.current) return;
    setLoadout(nextLoadout);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) setIsGenerating(false);
    else
      generationTimer.current = window.setTimeout(
        () => setIsGenerating(false),
        generationDurationMs,
      );
  }, [catalog, experimentalNames, isGenerating, requireExperimental, selectedClass]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      const directions = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (directions.includes(event.code)) {
        event.preventDefault();
        const current = selectedClass ? classes.indexOf(selectedClass) : -1;
        const width = classIconsRef.current
          ? getComputedStyle(classIconsRef.current).gridTemplateColumns.split(' ').length
          : 5;
        let next = current < 0 ? 0 : current;
        if (event.code === 'ArrowLeft') next = current > 0 ? current - 1 : classes.length - 1;
        if (event.code === 'ArrowRight') next = current < classes.length - 1 ? current + 1 : 0;
        if (event.code === 'ArrowUp') next = (current - width + classes.length) % classes.length;
        if (event.code === 'ArrowDown') next = (current + width) % classes.length;
        setSelectedClass(classes[next]);
        if (event.target instanceof Node && classIconsRef.current?.contains(event.target)) {
          classIconsRef.current.querySelectorAll('button')[next]?.focus();
        }
      } else if (event.code === 'Space' || event.code === 'Enter') {
        // Space generates from a focused class button; Enter keeps its native action.
        const spaceOnClass =
          event.code === 'Space' &&
          event.target instanceof Node &&
          classIconsRef.current?.contains(event.target);
        if (
          !spaceOnClass &&
          event.target instanceof HTMLElement &&
          event.target.closest('button, a')
        )
          return;
        event.preventDefault();
        generate();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [generate, selectedClass]);

  return (
    <>
      {isLoadingAssets && (
        <div className="loading-overlay" role="status" aria-live="polite">
          <div className="loading-content">
            <div className="loading-spinner" />
            <div id="loading-progress">Loading assets…</div>
          </div>
        </div>
      )}
      <main className="container">
        <header className="page-header">
          <h1>{title}</h1>
          <button
            className={`menu-button generate-button${isGenerating ? ' generating' : ''}`}
            type="button"
            onClick={generate}
            disabled={!selectedClass || isGenerating}
          >
            <RefreshCw
              className="generate-icon"
              style={{ transform: `rotate(${rotation}deg)` }}
              size={21}
              aria-hidden="true"
            />
            <span>Generate</span>
          </button>
          {navigation && (
            <button className="menu-button" type="button" onClick={navigation.onClick}>
              <ArrowLeft size={18} aria-hidden="true" />
              {navigation.label}
            </button>
          )}
        </header>
        <div className="loadout-shell">
          <GridBackground />
          <div className="class-icons" ref={classIconsRef} aria-label="Classes">
            {classes.map((className) => (
              <button
                className="class-button"
                type="button"
                key={className}
                onClick={() => setSelectedClass(className)}
                aria-label={`Select ${className}`}
                aria-pressed={selectedClass === className}
              >
                <img
                  className="class-icon"
                  src={iconPath(className)}
                  alt=""
                  draggable={false}
                  decoding="async"
                />
                <span>{className}</span>
              </button>
            ))}
          </div>
          <section className="equipment" aria-label="Generated loadout" aria-busy={isGenerating}>
            {loadout ? (
              <>
                <Portrait className={loadout.className} />
                <div className="weapon-list">
                  <WeaponCard
                    slot="Primary"
                    weapon={loadout.Primary}
                    delay={0}
                    experimental={experimentalNames.has(loadout.Primary.name)}
                  />
                  <WeaponCard
                    slot="Secondary"
                    weapon={loadout.Secondary}
                    delay={35}
                    experimental={experimentalNames.has(loadout.Secondary.name)}
                  />
                  <WeaponCard
                    slot="Melee"
                    weapon={loadout.Melee}
                    delay={70}
                    experimental={experimentalNames.has(loadout.Melee.name)}
                  />
                  <OptionalWeaponCard
                    weapon={loadout.PDA}
                    experimental={!!loadout.PDA && experimentalNames.has(loadout.PDA.name)}
                  />
                </div>
              </>
            ) : (
              <div className="empty-loadout">
                <img
                  src={asset('images/branding/tc2-monochrome.svg')}
                  alt="Typical Colors 2"
                  width={120}
                  height={120}
                  draggable={false}
                />
              </div>
            )}
          </section>
        </div>
        <footer className="credits">
          <span>
            Site: {onCreditsUnlock ? <FracturedCredit onShatter={onCreditsUnlock} /> : 'Rocks'}
          </span>
          <span>Class portraits: Alyssa</span>
          <span>Weapon icons: TC2 Wiki</span>
        </footer>
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

  const activateExperimentalMode = useCallback(
    (visualFinished: Promise<void> = Promise.resolve()) => {
      if (experimentalMode || unlocking.current) return;
      unlocking.current = true;
      const audio =
        secretAudio.current ?? new Audio(`${import.meta.env.BASE_URL}audio/breaking-glass.mp3`);
      audio.currentTime = 0;
      audio.preservesPitch = false;
      audio.playbackRate = 0.9 + Math.random() * 0.2;
      let finishAudio!: () => void;
      const audioFinished = new Promise<void>((resolve) => {
        finishAudio = resolve;
      });
      const enterExperimentalMode = () => {
        finishAudio();
      };
      // Switching modes unmounts the credit, so let both effects finish first.
      void Promise.all([visualFinished, audioFinished]).then(() => {
        unlocking.current = false;
        setExperimentalMode(true);
      });
      audio.addEventListener('ended', enterExperimentalMode, { once: true });
      audio.addEventListener('error', enterExperimentalMode, { once: true });
      void audio.play().catch(enterExperimentalMode);
    },
    [experimentalMode],
  );
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
  ) : (
    <LoadoutGenerator key="normal" catalog={weapons} onCreditsUnlock={activateExperimentalMode} />
  );
}
