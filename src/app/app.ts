import {
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnInit,
  OnDestroy,
  PLATFORM_ID,
  QueryList,
  ViewChild,
  ViewChildren,
  inject
} from '@angular/core';
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Gift, Letter, LetterType, OwlFlight, Particle, PasswordChar } from './models/santa.models';

const JOKES = [
  'Drogi Mikołaju! W tym roku byłem(-am) prawie zawsze grzeczny(-a). Kilka drobnych incydentów z kotem się zdarzyło, ale to on zaczął. Dla reniferów zostawiam marchewki, dla Ciebie pierniki (jeśli nie zjem ich wcześniej). Poniżej lista rzeczy, które bardzo by się przydały. Jeśli zabraknie miejsca w worku, mogę się zmieścić w kominie.',
  'Drogi Mikołaju! Piszę z wyprzedzeniem, żeby elfy zdążyły wyprodukować wszystko na czas. Obiecuję, że od Nowego Roku będę jeść warzywa i sprzątać pokój. Prezenty proszę zapakować tak, żeby nikt nie zgadł przed wigilią!',
  'Drogi Święty Mikołaju! Bardzo dziękuję za zeszłoroczne prezenty – były wspaniałe. W tym roku mam tylko kilka małych marzeń. Renifery niech uważają na dach sąsiada, bo postawił nową antenę!',
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [FormsModule, NgTemplateOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('fxCanvas', { static: false }) fxCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pwInputRef', { static: false }) pwInputRef?: ElementRef<HTMLInputElement>;
  @ViewChildren('letterDomRef') letterDomRefs!: QueryList<ElementRef<HTMLElement>>;

  // Hardcoded password
  readonly secret = 'alohomora';

  // Phases & View States
  phase: 'login' | 'main' = 'login';
  worldUp = false;
  sleighActive = false;
  ambientSleighActive = false;
  headerVisible = false;
  busy = false;

  // Floating Password Input State
  pw = '';
  pwLetters: PasswordChar[] = [];
  pwState: 'idle' | 'error' | 'success' = 'idle';
  shakeError = false;
  isSubmitting = false;
  pwMovingUp = false;

  // Letters Data
  letters: Letter[] = [];
  activeLetter: Letter | null = null;
  isEditing = false;
  isNewLetter = false;
  isFolding = false;
  isClosing = false;
  nextLetterId = 1;

  // Folded envelope in center during owl pick-up & 3D letter insert/extract choreography
  centerEnvelope: Letter | null = null;
  centerEnvelopeTaken = false;
  envelopeStage: 'idle' | 'opening' | 'inserting' | 'sealed' = 'idle';

  // Animation Flights & Particle Engine
  activeFlights: OwlFlight[] = [];
  private flightCounter = 0;
  private particles: Particle[] = [];
  private animationFrameId = 0;
  private lastFrameTime = 0;

  // Environment & Atmosphere
  stars: { x: number; y: number; r: number; d: number; delay: number; twinkle: boolean }[] = [];
  snowflakes: { x: number; dur: number; delay: number; size: number }[] = [];
  snowActive = false;
  private idleTimer: any;
  private ambientTimer: any;
  private boundVisibilityHandler?: () => void;
  private boundResizeHandler?: () => void;

  ngOnInit(): void {
    this.generateEnvironment();

    if (this.isBrowser) {
      this.resetIdleTimer();
      this.setupCanvasAndLoop();
      this.setupStabilityListeners();
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      cancelAnimationFrame(this.animationFrameId);
      clearTimeout(this.idleTimer);
      clearInterval(this.ambientTimer);
      if (this.boundVisibilityHandler) {
        document.removeEventListener('visibilitychange', this.boundVisibilityHandler);
      }
      if (this.boundResizeHandler) {
        window.removeEventListener('resize', this.boundResizeHandler);
      }
    }
  }

  // --- Environment Generation (Hand-Painted Night Sky) ---
  private generateEnvironment(): void {
    this.stars = Array.from({ length: 180 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 92,
      r: Math.random() > 0.85 ? Math.random() * 2.2 + 2.0 : Math.random() * 1.8 + 0.8,
      d: 2.5 + Math.random() * 3.5,
      delay: Math.random() * 3.0,
      twinkle: Math.random() > 0.35,
    }));

    this.snowflakes = Array.from({ length: 65 }, () => ({
      x: Math.random() * 100,
      dur: 7 + Math.random() * 8,
      delay: -Math.random() * 10,
      size: 11 + Math.random() * 16,
    }));
  }

  // Activity listeners - NO mousemove listening so mouse movements never trigger change detection!
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:touchstart')
  onUserActivity(): void {
    if (!this.isBrowser) return;
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.snowActive = true;
      this.cdr.detectChanges();
    }, 90000);
  }

  // --- Ambient Sky Events (Calm, rare periodic event: every 65s) ---
  private startAmbientSkyEvents(): void {
    if (!this.isBrowser) return;
    clearInterval(this.ambientTimer);

    this.ambientTimer = setInterval(() => {
      // Never trigger when user is busy, reading/editing, or not in main view
      if (this.phase !== 'main' || this.busy || this.activeLetter) return;

      const roll = Math.random();
      if (roll < 0.5) {
        if (!this.ambientSleighActive && !this.sleighActive) {
          this.ambientSleighActive = true;
          this.cdr.detectChanges();
          setTimeout(() => {
            this.ambientSleighActive = false;
            this.cdr.detectChanges();
          }, 9500);
        }
      } else {
        this.flyAmbientOwl();
      }
    }, 65000);
  }

  private flyAmbientOwl(): void {
    const fromLeft = Math.random() > 0.5;
    const startX = fromLeft ? -130 : window.innerWidth + 130;
    const targetX = fromLeft ? window.innerWidth + 150 : -150;
    const startY = 70 + Math.random() * 90;
    const targetY = 80 + Math.random() * 100;

    const flight: OwlFlight = {
      id: ++this.flightCounter,
      startX,
      startY,
      targetX,
      targetY,
      duration: 5500,
      mode: 'ambient',
    };

    this.activeFlights = [...this.activeFlights, flight];
    this.cdr.detectChanges();

    setTimeout(() => {
      this.activeFlights = this.activeFlights.filter(f => f.id !== flight.id);
      this.cdr.detectChanges();
    }, 5500);
  }

  // --- Canvas Setup & Particle Loop ---
  private setupCanvasAndLoop(): void {
    setTimeout(() => {
      this.resizeCanvas();
      this.boundResizeHandler = () => this.resizeCanvas();
      window.addEventListener('resize', this.boundResizeHandler);

      this.lastFrameTime = performance.now();
      this.loop(this.lastFrameTime);
    }, 50);
  }

  private resizeCanvas(): void {
    if (!this.fxCanvas?.nativeElement) return;
    const canvas = this.fxCanvas.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private setupStabilityListeners(): void {
    this.boundVisibilityHandler = () => {
      if (!document.hidden) {
        this.lastFrameTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', this.boundVisibilityHandler);
  }

  // --- Particle Loop (Ember wind, Golden stardust, Scraps) ---
  private loop = (now: number): void => {
    if (!this.isBrowser) return;

    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    if (this.fxCanvas?.nativeElement) {
      const canvas = this.fxCanvas.nativeElement;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
          const p = this.particles[i];
          p.life += dt;

          if (p.life >= p.maxLife) {
            this.particles.splice(i, 1);
            continue;
          }

          const progress = p.life / p.maxLife;

          if (p.type === 'ember') {
            p.vx += p.ax * dt;
            p.vy += p.ay * dt;
            p.x += p.vx;
            p.y += p.vy + Math.sin(p.life * 14 + (p.wobbleSpeed || 0)) * 0.85;

            const flicker = 0.75 + Math.sin(p.life * 22) * 0.25;
            p.alpha = Math.max(0, (1 - progress * progress) * flicker);

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.shadowColor = progress < 0.6 ? '#ff4500' : '#881111';
            ctx.shadowBlur = progress < 0.5 ? 8 : 2;

            if (progress < 0.25) {
              ctx.fillStyle = '#fff4a0';
            } else if (progress < 0.6) {
              ctx.fillStyle = '#ff5511';
            } else {
              ctx.fillStyle = '#8a1a1a';
            }

            const currentSize = Math.max(0.7, p.size * (1 - progress * 0.55));
            ctx.beginPath();
            ctx.arc(p.x, p.y, currentSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (p.type === 'gold') {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha = Math.max(0, 1 - progress);

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.shadowColor = '#ffd700';
            ctx.shadowBlur = 10;
            ctx.fillStyle = p.color;

            const s = p.size * (1 - progress * 0.4);
            ctx.translate(p.x, p.y);
            if (p.rotation !== undefined && p.vRot !== undefined) {
              p.rotation += p.vRot * dt;
              ctx.rotate(p.rotation);
            }
            ctx.beginPath();
            ctx.moveTo(0, -s);
            ctx.lineTo(s * 0.3, -s * 0.3);
            ctx.lineTo(s, 0);
            ctx.lineTo(s * 0.3, s * 0.3);
            ctx.lineTo(0, s);
            ctx.lineTo(-s * 0.3, s * 0.3);
            ctx.lineTo(-s, 0);
            ctx.lineTo(-s * 0.3, -s * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else if (p.type === 'scrap') {
            p.x += p.vx;
            p.vy += 12 * dt;
            p.y += p.vy;
            p.alpha = Math.max(0, 1 - progress);

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.translate(p.x, p.y);
            if (p.rotation !== undefined && p.vRot !== undefined) {
              p.rotation += p.vRot * dt;
              ctx.rotate(p.rotation);
            }
            ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.7);
            ctx.restore();
          }
        }
      }
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  // --- Password Logic (Floating Input in the Air) ---
  onPwChange(): void {
    if (this.pwState !== 'idle') {
      this.pwState = 'idle';
      this.shakeError = false;
    }
    this.pwLetters = this.pw.split('').map((char, id) => ({
      id,
      char,
      dissolved: false,
    }));
    this.cdr.detectChanges();
  }

  focusInput(): void {
    this.pwInputRef?.nativeElement?.focus();
  }

  async submitPassword(): Promise<void> {
    if (this.busy || this.isSubmitting || !this.pw.trim()) return;

    this.isSubmitting = true;
    const isCorrect = this.pw.trim().toLowerCase() === this.secret;

    if (!isCorrect) {
      // 1. BŁĘDNE HASŁO: czerwone rozżarzenie -> spektakularne rozpylenie na wietrze litera po literze!
      this.pwState = 'error';
      this.shakeError = true;
      this.cdr.detectChanges();
      await this.wait(400);
      this.shakeError = false;
      this.cdr.detectChanges();

      const letterElements = this.letterDomRefs.toArray();

      for (let i = 0; i < this.pwLetters.length; i++) {
        const item = this.pwLetters[i];
        const domEl = letterElements[i]?.nativeElement;

        if (domEl) {
          const rect = domEl.getBoundingClientRect();
          this.spawnEmberWindGust(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width, rect.height);
        }

        item.dissolved = true;
        this.cdr.detectChanges(); // <--- CRITICAL! Re-renders letter dissolution!
        await this.wait(130);
      }

      await this.wait(700);

      this.pw = '';
      this.pwLetters = [];
      this.pwState = 'idle';
      this.isSubmitting = false;
      this.cdr.detectChanges();
      this.focusInput();
    } else {
      // 2. DOBRE HASŁO: rozbłysk w pył litera po literze -> pole jedzie w górę -> mikołaj przelatuje nad polem
      this.pwState = 'success';
      this.cdr.detectChanges();

      const letterElements = this.letterDomRefs.toArray();

      for (let i = 0; i < this.pwLetters.length; i++) {
        const item = this.pwLetters[i];
        const domEl = letterElements[i]?.nativeElement;

        if (domEl) {
          const rect = domEl.getBoundingClientRect();
          this.spawnGoldenStardustBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 34);
        }

        item.dissolved = true;
        this.cdr.detectChanges(); // <--- CRITICAL! Every letter visibly dissolves!
        await this.wait(120);
      }

      // Pole na hasło jedzie w górę do nieba, a tło płynnie się wznosi
      this.pwMovingUp = true;
      this.worldUp = true;
      this.cdr.detectChanges();
      await this.wait(800);

      // Mikołaj majestatycznie przelatuje NAD tym polem w górnej części nieba
      this.sleighActive = true;
      this.cdr.detectChanges();
      await this.wait(6200);
      this.sleighActive = false;
      this.cdr.detectChanges();

      // Złota gwiazdka rozkwita na niebie
      this.phase = 'main';
      this.pwMovingUp = false;
      this.isSubmitting = false;
      this.cdr.detectChanges();
      await this.wait(250);
      this.headerVisible = true;
      this.cdr.detectChanges();

      // Sowy przynoszą początkowe listy
      await this.enterInitialLetters();

      // Start calm atmospheric background events
      this.startAmbientSkyEvents();

      this.isSubmitting = false;
      this.cdr.detectChanges();
    }
  }

  // --- Spawning Ember Particles (Wind Gust) ---
  private spawnEmberWindGust(cx: number, cy: number, w: number, h: number): void {
    const count = 52;
    for (let i = 0; i < count; i++) {
      const offsetX = (Math.random() - 0.5) * Math.max(w, 24);
      const offsetY = (Math.random() - 0.5) * Math.max(h, 44);

      this.particles.push({
        x: cx + offsetX,
        y: cy + offsetY,
        vx: 2.6 + Math.random() * 4.2,
        vy: -1.6 - Math.random() * 2.8,
        ax: 2.2 + Math.random() * 1.6,
        ay: -0.4,
        size: 1.8 + Math.random() * 3.0,
        alpha: 1.0,
        life: 0,
        maxLife: 1.3 + Math.random() * 1.4,
        color: '#ff4500',
        type: 'ember',
        wobbleSpeed: Math.random() * 10,
      });
    }
  }

  // --- Spawning Golden Stardust ---
  private spawnGoldenStardustBurst(cx: number, cy: number, count: number): void {
    const colors = ['#ffffff', '#fff5b0', '#ffd700', '#ffa500'];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.8;
      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.4,
        ax: 0,
        ay: 0.15,
        size: 2.2 + Math.random() * 3.4,
        alpha: 1.0,
        life: 0,
        maxLife: 1.4 + Math.random() * 1.1,
        color: colors[Math.floor(Math.random() * colors.length)],
        type: 'gold',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 6,
      });
    }
  }

  // --- Spawning Paper Scraps ---
  private spawnPaperScraps(cx: number, cy: number): void {
    for (let i = 0; i < 35; i++) {
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 60,
        y: cy + (Math.random() - 0.5) * 40,
        vx: (Math.random() - 0.5) * 4.5,
        vy: -2.5 - Math.random() * 3.0,
        ax: 0,
        ay: 3.5,
        size: 4 + Math.random() * 8,
        alpha: 1.0,
        life: 0,
        maxLife: 1.6 + Math.random() * 0.8,
        color: Math.random() > 0.4 ? '#fbf5e6' : '#d4af37',
        type: 'scrap',
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 10,
      });
    }
  }

  // --- Initial Letters Delivery by Owls ---
  private async enterInitialLetters(): Promise<void> {
    this.letters = [
      {
        id: this.nextLetterId++,
        from: 'Aleksandra',
        type: 'standard',
        text: JOKES[0],
        gifts: [
          { name: 'Klocki architektoniczne', url: 'https://example.com/klocki' },
          { name: 'Ciepłe skarpety w renifery', url: '' },
        ],
        away: true,
      },
      {
        id: this.nextLetterId++,
        from: 'Kuba i Zosia',
        type: 'child',
        text: JOKES[1],
        gifts: [
          { name: 'Zestaw małego chemika', url: 'https://example.com/laboratorium', claimed: false },
          { name: 'Drewniana kolejka górska', url: 'https://example.com/kolejka', claimed: false },
          { name: 'Pluszowa sowa śnieżna', url: '', claimed: true },
        ],
        away: true,
      },
    ];
    this.cdr.detectChanges();

    await this.wait(300);

    for (let i = 0; i < this.letters.length; i++) {
      const letter = this.letters[i];
      await this.wait(500);
      const targetPos = this.getTileCenterCoordinates(letter.id);
      // Since owl flies from right to left (fly-to-left), her beak is at -43px horizontally from owl anchor
      const slotOwlX = targetPos.x + 43;
      const slotOwlY = targetPos.y + 8;
      await this.flyOwlWithLetter(
        window.innerWidth + 180,
        -120,
        slotOwlX,
        slotOwlY,
        letter.from,
        2450
      );
      // Instant reveal at touchdown - zero lag!
      letter.away = false;
      this.cdr.detectChanges();
      this.sendOwlAway(slotOwlX, slotOwlY);
    }
  }

  // --- Owl Flights Execution ---
  private async flyOwlWithLetter(
    sx: number,
    sy: number,
    tx: number,
    ty: number,
    cargoName: string | undefined,
    durationMs: number,
    mode: 'deliver' | 'pickup' | 'carry-climb' = 'deliver'
  ): Promise<void> {
    const flight: OwlFlight = {
      id: ++this.flightCounter,
      startX: sx,
      startY: sy,
      targetX: tx,
      targetY: ty,
      cargoName,
      duration: durationMs,
      mode,
    };

    this.activeFlights = [...this.activeFlights, flight];
    this.cdr.detectChanges(); // <--- CRITICAL! Owl renders immediately!

    await this.wait(durationMs);
    this.activeFlights = this.activeFlights.filter(f => f.id !== flight.id);
    this.cdr.detectChanges();
  }

  private sendOwlAway(tx: number, ty: number): void {
    const flight: OwlFlight = {
      id: ++this.flightCounter,
      startX: tx,
      startY: ty,
      targetX: tx > window.innerWidth / 2 ? window.innerWidth + 240 : -240,
      targetY: ty - 180,
      cargoName: undefined,
      duration: 3400,
      mode: 'leave',
    };

    this.activeFlights = [...this.activeFlights, flight];
    this.cdr.detectChanges();

    setTimeout(() => {
      this.activeFlights = this.activeFlights.filter(f => f.id !== flight.id);
      this.cdr.detectChanges();
    }, 3400);
  }

  private getTileCenterCoordinates(id: number): { x: number; y: number } {
    if (!this.isBrowser) return { x: window.innerWidth / 2, y: 280 };
    const el = document.querySelector(`[data-id="${id}"]`) as HTMLElement;
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        };
      }
    }
    return {
      x: window.innerWidth / 2,
      y: 280,
    };
  }

  // --- Letter Management & Actions ---
  createNewLetter(type: LetterType = 'standard'): void {
    if (this.busy) return;
    const randomJoke = JOKES[Math.floor(Math.random() * JOKES.length)];
    this.activeLetter = {
      id: 0,
      from: '',
      type,
      text: randomJoke,
      gifts: [{ name: '', url: '' }],
    };
    this.isEditing = true;
    this.isNewLetter = true;
    this.isFolding = false;
    this.isClosing = false;
    this.cdr.detectChanges();
  }

  setLetterType(type: LetterType): void {
    if (!this.activeLetter) return;
    this.activeLetter.type = type;
    this.cdr.detectChanges();
  }

  toggleGiftSelection(gift: Gift): void {
    if (!this.activeLetter || this.activeLetter.type !== 'child' || gift.claimed) return;
    gift.selected = !gift.selected;
    this.syncActiveLetterToStore();
    this.cdr.detectChanges();
  }

  stampGiftByElves(gift: Gift, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    if (!this.activeLetter || this.activeLetter.type !== 'child' || gift.claimed) return;
    gift.selected = false;
    gift.claimed = true;

    if (event && this.isBrowser) {
      this.spawnGoldenStardustBurst(event.clientX, event.clientY, 26);
    }

    this.syncActiveLetterToStore();
    this.cdr.detectChanges();
  }

  private syncActiveLetterToStore(): void {
    if (!this.activeLetter || this.isNewLetter) return;
    const idx = this.letters.findIndex(l => l.id === this.activeLetter!.id);
    if (idx !== -1) {
      this.letters[idx] = structuredClone(this.activeLetter);
      this.letters = [...this.letters];
    }
  }

  async openLetter(letter: Letter, event: MouseEvent): Promise<void> {
    if (this.busy || letter.away || letter.removing) return;

    try {
      this.busy = true;
      letter.away = true;
      this.centerEnvelope = structuredClone(letter);
      this.centerEnvelopeTaken = false;
      this.envelopeStage = 'opening';
      this.cdr.detectChanges();

      // Wait for flap to open (0-620ms) and folded parchment to slide out of the pocket (480-1330ms)
      await this.wait(1360);

      this.centerEnvelope = null;
      this.envelopeStage = 'idle';
      this.activeLetter = structuredClone(letter);
      this.isEditing = false;
      this.isNewLetter = false;
      this.isFolding = false;
      this.isClosing = false;
      this.cdr.detectChanges();
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  // Animated 3D folding & inserting back into envelope on close
  async closeModal(): Promise<void> {
    if (this.busy || this.isClosing || !this.activeLetter) return;

    try {
      this.busy = true;
      const wasNew = this.isNewLetter;
      const closingCopy = structuredClone(this.activeLetter);

      // 1. Fold the 3 parchment sections up in 3D (calm pace)
      this.isClosing = true;
      this.cdr.detectChanges();
      await this.wait(960);

      this.activeLetter = null;
      this.isClosing = false;
      this.isFolding = false;

      if (!wasNew) {
        // 2. Slide the folded parchment back into the open envelope & close the flap
        this.centerEnvelope = closingCopy;
        this.centerEnvelopeTaken = false;
        this.envelopeStage = 'inserting';
        this.cdr.detectChanges();

        await this.wait(1520);

        const slotLetter = this.letters.find(l => l.id === closingCopy.id);
        if (slotLetter) {
          slotLetter.away = false;
        }
        this.centerEnvelope = null;
        this.envelopeStage = 'idle';
      }

      this.cdr.detectChanges();
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  // Saving letter -> 3D Fold -> Slide into Open Envelope -> Seal Flap -> White Owl Hedwig grabs TOP in beak, flies off-screen & delivers!
  async saveAndSendLetter(): Promise<void> {
    if (this.busy || !this.activeLetter) return;

    try {
      this.busy = true;

      // Filter empty gifts
      this.activeLetter.gifts = this.activeLetter.gifts.filter(g => g.name?.trim() || g.url?.trim());

      // 1. 3D Fold the 3 parchment sections into a compact folded packet
      this.isFolding = true;
      this.cdr.detectChanges();
      await this.wait(960);

      const letterCopy = structuredClone(this.activeLetter);
      let letterId = letterCopy.id;

      if (this.isNewLetter) {
        letterId = this.nextLetterId++;
        letterCopy.id = letterId;
        letterCopy.away = true;
        this.letters = [...this.letters, letterCopy];
      } else {
        const idx = this.letters.findIndex(l => l.id === letterId);
        if (idx !== -1) {
          this.letters[idx] = { ...letterCopy, away: true };
          this.letters = [...this.letters];
        }
      }

      // 2. Open envelope appears in center -> folded letter slides inside -> flap folds shut -> wax seal stamps!
      this.centerEnvelope = letterCopy;
      this.centerEnvelopeTaken = false;
      this.envelopeStage = 'inserting';
      this.activeLetter = null;
      this.isClosing = false;
      this.isFolding = false;
      this.cdr.detectChanges();

      await this.wait(1180);
      if (this.isBrowser) {
        this.spawnGoldenStardustBurst(window.innerWidth / 2, window.innerHeight * 0.42, 24);
      }
      await this.wait(380);

      this.envelopeStage = 'sealed';
      this.cdr.detectChanges();

      // 3. White Owl Hedwig swoops in behind the envelope so her BEAK catches the TOP edge seamlessly!
      const targetPos = this.getTileCenterCoordinates(letterId);
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight * 0.42;

      // When flying left-to-right, Hedwig's beak is at (+43px, -43px) relative to owl anchor;
      // the top edge of .center-envelope-carrier is at (centerX, centerY - 86px).
      const pickupOwlX = centerX - 43;
      const pickupOwlY = centerY - 43;

      // Schedule envelope-taken 360ms before pickup completes so it scales smoothly into her beak with zero gap!
      setTimeout(() => {
        this.centerEnvelopeTaken = true;
        this.cdr.detectChanges();
      }, 1590);

      // Hedwig swoops in along a curved arc behind the envelope (z-index 66 < 72) up to its top edge
      await this.flyOwlWithLetter(-190, pickupOwlY - 90, pickupOwlX, pickupOwlY, undefined, 1950, 'pickup');

      // Instant zero-gap handoff at scale(1)!
      this.centerEnvelope = null;
      this.envelopeStage = 'idle';
      this.cdr.detectChanges();

      // 4. Hedwig dips slightly under the weight of the letter and flaps up in waves off-screen!
      const offscreenRightX = window.innerWidth + 250;
      const offscreenHighY = Math.max(35, pickupOwlY - 240);
      await this.flyOwlWithLetter(
        pickupOwlX,
        pickupOwlY,
        offscreenRightX,
        offscreenHighY,
        letterCopy.from,
        2900,
        'carry-climb'
      );

      // Brief turn in the night clouds before swooping back to place the letter in the gallery
      await this.wait(220);

      // 5. Hedwig swoops back in along a graceful curve from the high right sky to place the letter into its slot!
      const slotOwlX = targetPos.x + 43;
      const slotOwlY = targetPos.y + 8;
      await this.flyOwlWithLetter(
        window.innerWidth + 220,
        -100,
        slotOwlX,
        slotOwlY,
        letterCopy.from,
        2750,
        'deliver'
      );

      // Drop envelope into slot INSTANTLY upon touchdown
      const deliveredLetter = this.letters.find(l => l.id === letterId);
      if (deliveredLetter) {
        deliveredLetter.away = false;
        this.cdr.detectChanges();
      }

      // Owl flaps her wings and climbs away in a graceful multi-wave arc
      this.sendOwlAway(slotOwlX, slotOwlY);
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  async deleteLetter(letter: Letter, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.busy || letter.removing) return;

    try {
      this.busy = true;
      letter.removing = true;
      this.cdr.detectChanges();

      const targetPos = this.getTileCenterCoordinates(letter.id);
      this.spawnPaperScraps(targetPos.x, targetPos.y);

      await this.wait(850);
      this.letters = this.letters.filter(l => l.id !== letter.id);
      this.cdr.detectChanges();
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  addGiftRow(): void {
    if (!this.activeLetter) return;
    this.activeLetter.gifts.push({ name: '', url: '' });
    this.cdr.detectChanges();
  }

  removeGiftRow(index: number): void {
    if (!this.activeLetter) return;
    if (this.activeLetter.gifts[index]?.claimed) return;
    this.activeLetter.gifts.splice(index, 1);
    this.cdr.detectChanges();
  }

  formatUrl(url: string): string {
    return /^https?:\/\//i.test(url) ? url : 'https://' + url;
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
