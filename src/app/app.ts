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
import { firstValueFrom } from 'rxjs';
import { SantaApiService } from './services/santa-api.service';
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
  private readonly api = inject(SantaApiService);
  readonly isBrowser = isPlatformBrowser(this.platformId);

  @ViewChild('fxCanvas', { static: false }) fxCanvas?: ElementRef<HTMLCanvasElement>;
  @ViewChild('pwInputRef', { static: false }) pwInputRef?: ElementRef<HTMLInputElement>;
  @ViewChildren('letterDomRef') letterDomRefs!: QueryList<ElementRef<HTMLElement>>;

  // Hardcoded password and room code
  readonly secret = 'alohomora';
  currentRoomCode = '';

  // Home Page Portal State (Główna strona powitalna)
  homeRoomCode = '';
  homeRoomError = '';
  isCheckingHomeRoom = false;

  // 404 Not Found Stage (Skrzaty schowały tę stronę!)
  is404 = false;
  notFoundCode = '';
  elfSqueaking = false;

  // Guide / Instrukcja Poczty Mikołaja (Prompt po przelocie & Modal)
  showGuidePrompt = false;
  showGuideModal = false;

  // Elf Celebration on Letter Tile (po zarezerwowaniu prezentu)
  elfCheeringLetterId: number | string | null = null;
  elfCheeringGiftName = '';
  private elfCheeringTimer: any = null;

  // Turbo małe okienko: Create Page Modal State
  showCreatePageModal = false;
  newPageCode = '';
  newPagePassword = '';
  isCreatingPage = false;
  createPageError = '';
  createPageSuccess = '';

  // Periodic Sky Polling (Real-time Owl deliveries)
  private pollTimer: any;
  private lastUpdatedAt: string | null = null;
  private isPolling = false;

  // Phases & View States
  phase: 'login' | 'main' = 'login';
  worldUp = false;
  sleighActive = false;
  ambientSleighActive = false;
  headerVisible = false;
  hasFetchedLetters = false;
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
  snowStopping = false;
  private idleTimer: any;
  private snowStopTimer: any;
  private ambientTimer: any;
  private boundVisibilityHandler?: () => void;
  private boundResizeHandler?: () => void;

  ngOnInit(): void {
    this.generateEnvironment();

    if (this.isBrowser) {
      // Read page code directly from URL path: e.g. localhost:4200/kowalscy
      const pathCode = window.location.pathname.replace(/^\/+/, '').split('/')[0]?.trim();
      const urlParams = new URLSearchParams(window.location.search);
      const queryCode = urlParams.get('code') || urlParams.get('room');

      if (pathCode) {
        this.currentRoomCode = decodeURIComponent(pathCode).toLowerCase();
        this.checkCurrentRoom();
      } else if (queryCode) {
        this.currentRoomCode = queryCode.trim().toLowerCase();
        this.checkCurrentRoom();
      } else {
        this.currentRoomCode = '';
      }

      this.resetIdleTimer();
      this.setupCanvasAndLoop();
      this.setupStabilityListeners();
    }
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      cancelAnimationFrame(this.animationFrameId);
      clearTimeout(this.idleTimer);
      clearTimeout(this.snowStopTimer);
      clearInterval(this.ambientTimer);
      this.stopSkyPolling();
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

    this.generateSnowflakes();
  }

  private generateSnowflakes(): void {
    this.snowflakes = Array.from({ length: 65 }, () => ({
      x: Math.random() * 100,
      dur: 8 + Math.random() * 6,
      delay: Math.random() * 5.5,
      size: 11 + Math.random() * 16,
    }));
  }

  normalizeLetterType(type: any): LetterType {
    if (!type) return 'standard';
    const val = String(type).trim().toLowerCase();
    return (val === 'child' || val === 'kid') ? 'child' : 'standard';
  }

  // Activity listeners - gracefully completes snow drift & resets idle timer on user interaction!
  @HostListener('window:keydown')
  @HostListener('window:click')
  @HostListener('window:touchstart')
  @HostListener('window:scroll')
  onUserActivity(): void {
    if (!this.isBrowser) return;
    if (this.snowActive && !this.snowStopping) {
      this.snowStopping = true;
      this.cdr.detectChanges();
      clearTimeout(this.snowStopTimer);
      this.snowStopTimer = setTimeout(() => {
        this.snowActive = false;
        this.snowStopping = false;
        this.cdr.detectChanges();
      }, 14000);
    }
    this.resetIdleTimer();
  }

  private resetIdleTimer(): void {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      clearTimeout(this.snowStopTimer);
      this.generateSnowflakes();
      this.snowStopping = false;
      this.snowActive = true;
      this.cdr.detectChanges();
    }, 60000);
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
      hasCargo: false,
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
          } else if (p.type === 'dementor') {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha = Math.max(0, (1 - progress) * 0.85);

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.shadowColor = '#0d152a';
            ctx.shadowBlur = 14;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1 + progress * 0.8), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          } else if (p.type === 'soul') {
            p.x += p.vx + Math.sin(p.life * 8) * 1.5;
            p.y += p.vy;
            p.alpha = Math.max(0, (1 - progress * progress));

            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.shadowColor = '#38bdf8';
            ctx.shadowBlur = 12;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.8, p.size * (1 - progress * 0.5)), 0, Math.PI * 2);
            ctx.fill();
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

  clearRoomCode(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.currentRoomCode = '';
    this.pw = '';
    this.pwLetters = [];
    this.pwState = 'idle';
    if (this.isBrowser) {
      window.history.pushState({}, '', '/');
    }
    this.cdr.detectChanges();
    this.focusInput();
  }

  async submitPassword(): Promise<void> {
    if (this.busy || this.isSubmitting || !this.pw.trim()) return;

    // KROK 1: Jeśli jesteśmy na głównym "/" i nie wybrano jeszcze kodu skrzynki:
    if (!this.currentRoomCode) {
      const enteredCode = this.pw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
      if (enteredCode.length < 2) {
        this.pwState = 'error';
        this.shakeError = true;
        this.cdr.detectChanges();
        await this.wait(400);
        this.shakeError = false;
        this.pwState = 'idle';
        this.cdr.detectChanges();
        return;
      }

      this.currentRoomCode = enteredCode;
      if (this.isBrowser) {
        window.history.pushState({}, '', '/' + enteredCode);
        this.spawnGoldenStardustBurst(window.innerWidth / 2, window.innerHeight * 0.45, 20);
      }
      this.pw = '';
      this.pwLetters = [];
      this.pwState = 'idle';
      this.checkCurrentRoom();
      this.cdr.detectChanges();
      this.focusInput();
      return;
    }

    // KROK 2: Weryfikacja hasła dla wybranego pokoju currentRoomCode:
    this.isSubmitting = true;
    const enteredPw = this.pw.trim().toLowerCase();
    const targetCode = this.currentRoomCode;

    let isCorrect = false;
    let loadedLetters: Letter[] = [];

    try {
      const page = await firstValueFrom(this.api.verifyPassword(targetCode, enteredPw));
      if (page) {
        isCorrect = true;
        this.currentRoomCode = page.code;
        this.lastUpdatedAt = page.updatedAt || null;
        loadedLetters = (page.letters || []).map(l => ({
          ...l,
          type: this.normalizeLetterType(l.type)
        }));
      }
    } catch (err: any) {
      if (err?.status === 404 || err?.error?.notFound) {
        this.is404 = true;
        this.notFoundCode = targetCode;
        this.isSubmitting = false;
        this.pw = '';
        this.pwLetters = [];
        this.pwState = 'idle';
        this.cdr.detectChanges();
        return;
      }
      // If offline / local fallback
      if (err?.status === 0 && enteredPw.toLowerCase() === this.secret) {
        isCorrect = true;
        loadedLetters = [];
      } else {
        isCorrect = false;
      }
    }

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

      // Mikołaj żwawo przelatuje nad polem w górnej części nieba (żwawy, płynny przelot)
      this.sleighActive = true;
      this.cdr.detectChanges();
      this.trackSleighStardust(3600);
      await this.wait(3600);
      this.sleighActive = false;
      this.cdr.detectChanges();

      // Złota gwiazdka rozkwita na niebie
      this.letters = loadedLetters;
      this.hasFetchedLetters = true;
      this.nextLetterId = Math.max(...this.letters.map(l => Number(l.id) || 0), 0) + 1;
      this.phase = 'main';
      this.pwMovingUp = false;
      this.isSubmitting = false;
      this.cdr.detectChanges();
      await this.wait(250);
      this.headerVisible = true;
      this.cdr.detectChanges();

      // Start calm atmospheric background events & live updates polling
      this.startAmbientSkyEvents();
      this.startSkyPolling();

      // Pokaż sowę z instrukcją jeśli użytkownik jeszcze jej nie zamknął
      if (this.isBrowser && !localStorage.getItem('santa_guide_seen')) {
        setTimeout(() => {
          this.showGuidePrompt = true;
          this.cdr.detectChanges();
        }, 800);
      }

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

  // --- Dementor Dark Soul Vortex (Harry Potter Deletion) ---
  private spawnDementorAttackVortex(cx: number, cy: number): void {
    // 1. Billowing dark shadows swirling upwards
    for (let i = 0; i < 65; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.8 + Math.random() * 3.2;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 70,
        y: cy + (Math.random() - 0.5) * 50,
        vx: Math.cos(angle) * speed,
        vy: -1.6 - Math.random() * 3.2,
        ax: 0,
        ay: -0.2,
        size: 10 + Math.random() * 22,
        alpha: 0.95,
        life: 0,
        maxLife: 2.3 + Math.random() * 0.9,
        color: Math.random() > 0.4 ? '#050a17' : '#0f1a34',
        type: 'dementor'
      });
    }

    // 2. Glowing cyan ghostly soul wisps being sucked out
    for (let i = 0; i < 55; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.9 + Math.random() * 3.5;
      this.particles.push({
        x: cx + (Math.random() - 0.5) * 50,
        y: cy + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed * 0.85,
        vy: -2.0 - Math.random() * 3.8,
        ax: 0,
        ay: -0.4,
        size: 3.0 + Math.random() * 4.5,
        alpha: 1.0,
        life: 0,
        maxLife: 2.0 + Math.random() * 0.8,
        color: Math.random() > 0.3 ? '#88f0ff' : '#ffffff',
        type: 'soul'
      });
    }
  }

  // --- Trailing Golden Stardust directly from Santa's Sleigh Runners ---
  private trackSleighStardust(durationMs: number): void {
    if (!this.isBrowser) return;
    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= durationMs) {
        clearInterval(interval);
        return;
      }

      const sleighEl = document.querySelector('.sleigh-flight') as HTMLElement;
      if (sleighEl) {
        const rect = sleighEl.getBoundingClientRect();
        // Golden runners are located at the back-bottom of Santa's sleigh (approx 16% from left, 74% from top)
        if (rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth) {
          const runnerX = rect.left + rect.width * 0.16;
          const runnerY = rect.top + rect.height * 0.74;
          this.spawnSleighRunnerSparks(runnerX, runnerY);
        }
      }
    }, 110);
  }

  private spawnSleighRunnerSparks(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 12,
        y: y + (Math.random() - 0.5) * 8,
        vx: -2.2 - Math.random() * 2.0,
        vy: 0.4 + Math.random() * 1.6,
        ax: 0,
        ay: 0.1,
        size: 1.8 + Math.random() * 2.8,
        alpha: 1.0,
        life: 0,
        maxLife: 1.1 + Math.random() * 0.6,
        color: Math.random() > 0.35 ? '#ffd700' : '#fff4b8',
        type: 'gold',
        rotation: Math.random() * Math.PI,
        vRot: (Math.random() - 0.5) * 8,
      });
    }
  }

  // --- Initial Letters Delivery by Owls ---
  private async enterInitialLetters(backendLetters: Letter[] = []): Promise<void> {
    if (backendLetters && backendLetters.length > 0) {
      this.letters = backendLetters.map(l => ({ ...l, away: true }));
      this.nextLetterId = Math.max(...this.letters.map(l => Number(l.id) || 0), 0) + 1;
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
    } else {
      // Pusta tablica: brak sztucznych placeholderów, instrukcja empty-sky-note jest widoczna!
      this.letters = [];
      this.cdr.detectChanges();
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
    mode: 'deliver' | 'pickup' | 'carry-climb' = 'deliver',
    hasCargo?: boolean
  ): Promise<void> {
    const flight: OwlFlight = {
      id: ++this.flightCounter,
      startX: sx,
      startY: sy,
      targetX: tx,
      targetY: ty,
      cargoName: cargoName?.trim() || 'List do Mikołaja',
      hasCargo: hasCargo ?? (mode === 'deliver' || mode === 'carry-climb'),
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
      hasCargo: false,
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
    // Wybór jest wyłącznie lokalnym krokiem w interfejsie - NIE zapisujemy go do bazy dopóki nie zostanie przyklepany!
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
    const currentLetterId = this.activeLetter.id;

    if (gift.id !== undefined && gift.id !== null) {
      this.api.claimGift(gift.id, true).subscribe({
        next: () => {
          this.lastUpdatedAt = new Date().toISOString();
        },
        error: (e) => console.warn('Failed to claim gift on backend', e)
      });
    }

    if (event && this.isBrowser) {
      this.spawnGoldenStardustBurst(event.clientX, event.clientY, 26);
    }

    this.syncActiveLetterToStore();
    this.triggerElfCelebration(currentLetterId, gift.name);
    this.cdr.detectChanges();
  }

  async checkCurrentRoom(): Promise<void> {
    if (!this.currentRoomCode) return;
    try {
      const res = await firstValueFrom(this.api.checkPageExists(this.currentRoomCode));
      if (res && res.exists === false) {
        this.is404 = true;
        this.notFoundCode = this.currentRoomCode;
        this.cdr.detectChanges();
      } else {
        this.is404 = false;
        this.cdr.detectChanges();
      }
    } catch (err: any) {
      if (err?.status === 404) {
        this.is404 = true;
        this.notFoundCode = this.currentRoomCode;
        this.cdr.detectChanges();
      }
    }
  }

  resetToHome(): void {
    this.is404 = false;
    this.notFoundCode = '';
    this.currentRoomCode = '';
    this.homeRoomCode = '';
    this.homeRoomError = '';
    this.pw = '';
    this.pwLetters = [];
    this.pwState = 'idle';
    if (this.isBrowser) {
      window.history.pushState({}, '', '/');
    }
    this.cdr.detectChanges();
  }

  async submitHomeRoomCode(): Promise<void> {
    const rawCode = this.homeRoomCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!rawCode || rawCode.length < 2) {
      this.homeRoomError = 'Wpisz co najmniej 2 znaki kodu.';
      return;
    }

    this.homeRoomError = '';
    this.isCheckingHomeRoom = true;
    try {
      const res = await firstValueFrom(this.api.checkPageExists(rawCode));
      if (res && res.exists === false) {
        this.is404 = true;
        this.notFoundCode = rawCode;
        if (this.isBrowser) {
          window.history.pushState({}, '', '/' + rawCode);
        }
        this.cdr.detectChanges();
        return;
      }

      this.currentRoomCode = rawCode;
      if (this.isBrowser) {
        window.history.pushState({}, '', '/' + rawCode);
        this.spawnGoldenStardustBurst(window.innerWidth / 2, window.innerHeight * 0.45, 20);
      }
      this.pw = '';
      this.pwLetters = [];
      this.pwState = 'idle';
      this.cdr.detectChanges();
      setTimeout(() => this.focusInput(), 150);
    } catch (err: any) {
      if (err?.status === 404) {
        this.is404 = true;
        this.notFoundCode = rawCode;
        if (this.isBrowser) {
          window.history.pushState({}, '', '/' + rawCode);
        }
      } else {
        // If offline / local test fallback
        this.currentRoomCode = rawCode;
        if (this.isBrowser) {
          window.history.pushState({}, '', '/' + rawCode);
        }
        this.pw = '';
        this.pwLetters = [];
        this.pwState = 'idle';
        setTimeout(() => this.focusInput(), 150);
      }
    } finally {
      this.isCheckingHomeRoom = false;
      this.cdr.detectChanges();
    }
  }

  openGuideModal(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.showGuidePrompt = false;
    this.showGuideModal = true;
    if (this.isBrowser) {
      localStorage.setItem('santa_guide_seen', 'true');
    }
    this.cdr.detectChanges();
  }

  closeGuideModal(): void {
    this.showGuideModal = false;
    if (this.isBrowser) {
      localStorage.setItem('santa_guide_seen', 'true');
    }
    this.cdr.detectChanges();
  }

  dismissGuidePrompt(event?: MouseEvent): void {
    if (event) event.stopPropagation();
    this.showGuidePrompt = false;
    if (this.isBrowser) {
      localStorage.setItem('santa_guide_seen', 'true');
    }
    this.cdr.detectChanges();
  }

  triggerElfCelebration(letterId: number | string, giftName: string = ''): void {
    this.elfCheeringLetterId = letterId;
    this.elfCheeringGiftName = giftName;
    this.cdr.detectChanges();
    clearTimeout(this.elfCheeringTimer);
    this.elfCheeringTimer = setTimeout(() => {
      this.elfCheeringLetterId = null;
      this.elfCheeringGiftName = '';
      this.cdr.detectChanges();
    }, 4000);
  }

  createFrom404(): void {
    const code = this.notFoundCode || this.currentRoomCode;
    this.is404 = false;
    this.openCreatePageModal();
    if (code) {
      this.newPageCode = code;
    }
    this.cdr.detectChanges();
  }

  onElfClick(event?: MouseEvent): void {
    this.elfSqueaking = true;
    if (event && this.isBrowser) {
      this.spawnGoldenStardustBurst(event.clientX, event.clientY, 18);
    }
    setTimeout(() => {
      this.elfSqueaking = false;
      this.cdr.detectChanges();
    }, 600);
    this.cdr.detectChanges();
  }

  // --- Turbo Małe Okienko: Tworzenie Nowej Listy / Strony ---
  openCreatePageModal(event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }
    this.showCreatePageModal = true;
    this.newPageCode = '';
    this.newPagePassword = '';
    this.createPageError = '';
    this.createPageSuccess = '';
    this.cdr.detectChanges();
  }

  closeCreatePageModal(): void {
    this.showCreatePageModal = false;
    this.createPageError = '';
    this.createPageSuccess = '';
    this.cdr.detectChanges();
  }

  async submitCreatePage(): Promise<void> {
    const rawCode = this.newPageCode.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    const rawPassword = this.newPagePassword.trim();

    if (!rawCode || rawCode.length < 3) {
      this.createPageError = 'Kod strony musi mieć co najmniej 3 znaki (litery, cyfry, myślniki).';
      this.cdr.detectChanges();
      return;
    }
    if (!rawPassword || rawPassword.length < 3) {
      this.createPageError = 'Hasło musi mieć co najmniej 3 znaki.';
      this.cdr.detectChanges();
      return;
    }

    this.isCreatingPage = true;
    this.createPageError = '';
    this.createPageSuccess = '';
    this.cdr.detectChanges();

    try {
      const res = await firstValueFrom(this.api.createPage(rawCode, rawPassword));
      this.createPageSuccess = `Magiczna strona /${res.code} została pomyślnie utworzona!`;
      this.currentRoomCode = res.code;

      if (this.isBrowser) {
        window.history.pushState({}, '', '/' + res.code);
        this.spawnGoldenStardustBurst(window.innerWidth / 2, window.innerHeight * 0.45, 36);
      }

      this.pw = rawPassword;
      this.onPwChange();
      this.cdr.detectChanges();

      await this.wait(1000);
      this.closeCreatePageModal();

      // Automatyczne wejście do nowo utworzonej strony
      if (this.phase === 'login') {
        this.submitPassword();
      }
    } catch (err: any) {
      if (err?.status === 409) {
        this.createPageError = 'Strona o tym kodzie już istnieje! Wybierz inny kod.';
      } else {
        this.createPageError = err?.error?.message || 'Błąd połączenia z serwerem. Upewnij się, że backend jest uruchomiony.';
      }
    } finally {
      this.isCreatingPage = false;
      this.cdr.detectChanges();
    }
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
      // Wyczyszczenie jakichkolwiek tymczasowych zaznaczeń przy otwarciu
      if (this.activeLetter?.gifts) {
        for (const g of this.activeLetter.gifts) {
          g.selected = false;
        }
      }
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
        try {
          const created = await firstValueFrom(
            this.api.createLetter(this.currentRoomCode, {
              from: letterCopy.from,
              text: letterCopy.text,
              type: this.normalizeLetterType(letterCopy.type),
              gifts: letterCopy.gifts
            })
          );
          letterId = Number(created.id) || this.nextLetterId++;
          letterCopy.id = letterId;
          letterCopy.type = this.normalizeLetterType(created.type || letterCopy.type);
          letterCopy.gifts = created.gifts || letterCopy.gifts;
        } catch (e) {
          console.warn('Backend createLetter failed, using local fallback', e);
          letterId = this.nextLetterId++;
          letterCopy.id = letterId;
        }
        letterCopy.away = true;
        this.letters = [...this.letters, letterCopy];
      } else {
        try {
          const updated = await firstValueFrom(
            this.api.updateLetter(this.currentRoomCode, letterId, {
              id: letterId,
              from: letterCopy.from,
              text: letterCopy.text,
              type: this.normalizeLetterType(letterCopy.type),
              gifts: letterCopy.gifts
            })
          );
          if (updated) {
            letterCopy.type = this.normalizeLetterType(updated.type || letterCopy.type);
            letterCopy.gifts = updated.gifts || letterCopy.gifts;
            this.lastUpdatedAt = new Date().toISOString();
          }
        } catch (e) {
          console.warn('Backend updateLetter failed, using local fallback', e);
        }
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

      // Hedwig swoops in along a curved arc behind the envelope (z-index 66 < 72) up to its top edge
      await this.flyOwlWithLetter(-190, pickupOwlY - 90, pickupOwlX, pickupOwlY, undefined, 1950, 'pickup', false);

      // Instant seamless handoff: envelope passes directly into Hedwig's beak at touchdown!
      this.centerEnvelope = null;
      this.envelopeStage = 'idle';
      this.centerEnvelopeTaken = false;
      this.cdr.detectChanges();

      const senderName = letterCopy.from?.trim() || 'List do Mikołaja';

      // 4. Hedwig dips slightly under the weight of the letter and flaps up in waves off-screen!
      const offscreenRightX = window.innerWidth + 250;
      const offscreenHighY = Math.max(35, pickupOwlY - 240);
      await this.flyOwlWithLetter(
        pickupOwlX,
        pickupOwlY,
        offscreenRightX,
        offscreenHighY,
        senderName,
        2900,
        'carry-climb',
        true
      );

      // Brief turn in the night clouds before swooping back to place the letter in the gallery
      await this.wait(220);

      // Recalculate slot position right before delivery in case of window layout change
      const freshTargetPos = this.getTileCenterCoordinates(letterId);
      const slotOwlX = freshTargetPos.x + 43;
      const slotOwlY = freshTargetPos.y + 8;

      // 5. Hedwig swoops back in along a graceful curve from the high right sky to place the letter into its slot!
      await this.flyOwlWithLetter(
        window.innerWidth + 220,
        -100,
        slotOwlX,
        slotOwlY,
        senderName,
        2750,
        'deliver',
        true
      );

      // Drop envelope into slot INSTANTLY upon touchdown
      const deliveredLetter = this.letters.find(l => l.id === letterId);
      if (deliveredLetter) {
        deliveredLetter.away = false;
        this.letters = [...this.letters];
        this.cdr.detectChanges();
      }

      // Owl flaps her wings and climbs away in a graceful multi-wave arc
      this.sendOwlAway(slotOwlX, slotOwlY);
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  // --- Secret 5-click easter egg on the wax seal to banish letter via Dementor ---
  private sealClickMap = new Map<number, { count: number; timer: any }>();

  onSealClick(letter: Letter, event: MouseEvent): void {
    event.stopPropagation();
    if (this.busy || letter.dementorAttacking) return;

    const letterId = letter.id;
    let entry = this.sealClickMap.get(letterId);
    if (!entry) {
      entry = { count: 0, timer: null };
      this.sealClickMap.set(letterId, entry);
    }

    entry.count++;
    if (entry.timer) clearTimeout(entry.timer);

    // Subtle magical spark feedback on each tap on the seal
    const target = event.currentTarget as HTMLElement;
    if (target) {
      const rect = target.getBoundingClientRect();
      this.spawnGoldenStardustBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, 4);
    }

    if (entry.count >= 5) {
      this.sealClickMap.delete(letterId);
      this.deleteLetter(letter, event);
    } else {
      entry.timer = setTimeout(() => {
        this.sealClickMap.delete(letterId);
      }, 2500);
    }
  }

  async deleteLetter(letter: Letter, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (this.busy || letter.removing || letter.dementorAttacking) return;

    try {
      this.busy = true;
      letter.dementorAttacking = true;
      this.cdr.detectChanges();

      const targetPos = this.getTileCenterCoordinates(letter.id);
      // Give time to clearly observe the Dementor swoop down and loom menacingly over the envelope
      await this.wait(850);
      this.spawnDementorAttackVortex(targetPos.x, targetPos.y);
      this.cdr.detectChanges();

      if (letter.id) {
        try {
          await firstValueFrom(this.api.deleteLetter(this.currentRoomCode, letter.id));
        } catch (e) {
          console.warn('Backend deleteLetter failed', e);
        }
      }

      // Total duration 3200ms matching CSS: 850ms entrance + 2350ms soul extraction & ascension
      await this.wait(2350);
      this.letters = this.letters.filter(l => l.id !== letter.id);
      this.cdr.detectChanges();
    } finally {
      this.busy = false;
      this.cdr.detectChanges();
    }
  }

  // --- Real-time Sky Polling (Hedwig delivers new letters live & Dementor banishes deleted ones) ---
  private startSkyPolling(): void {
    if (!this.isBrowser) return;
    this.stopSkyPolling();

    // Szybki polling co 7 sekund (live sync)
    this.pollTimer = setInterval(() => {
      this.checkAndFetchUpdates();
    }, 7000);
  }

  private stopSkyPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async checkAndFetchUpdates(): Promise<void> {
    // Nie przerywamy uzytkownikowi podczas animacji ani aktywnej edycji tresci listu
    if (
      this.phase !== 'main' ||
      this.busy ||
      (this.activeLetter && this.isEditing) ||
      this.isPolling ||
      !this.currentRoomCode
    ) {
      return;
    }

    try {
      this.isPolling = true;
      const page = await firstValueFrom(this.api.getPage(this.currentRoomCode));
      if (!page) return;

      // Jesli znacznik czasu jest identyczny, pomijamy
      if (this.lastUpdatedAt && page.updatedAt && page.updatedAt === this.lastUpdatedAt) {
        return;
      }

      this.lastUpdatedAt = page.updatedAt || this.lastUpdatedAt;
      const incomingLetters = (page.letters || []).map(l => ({
        ...l,
        type: this.normalizeLetterType(l.type)
      }));

      // 1. Identify letters that were removed on another device -> Dementor carries them off
      const currentIds = new Set(this.letters.map(l => l.id));
      const incomingIds = new Set(incomingLetters.map(l => l.id));

      const deletedLetters = this.letters.filter(l => !incomingIds.has(l.id) && !l.removing && !l.dementorAttacking);
      for (const dLetter of deletedLetters) {
        dLetter.dementorAttacking = true;
        this.cdr.detectChanges();
        const pos = this.getTileCenterCoordinates(dLetter.id);
        await this.wait(850);
        this.spawnDementorAttackVortex(pos.x, pos.y);
        await this.wait(2350);
        this.letters = this.letters.filter(l => l.id !== dLetter.id);
        this.cdr.detectChanges();
      }

      // 2. Identify new letters delivered to this board -> Hedwig swoops in to deliver!
      const newLetters = incomingLetters.filter(l => !currentIds.has(l.id));
      for (const newLetter of newLetters) {
        const letterCopy: Letter = {
          ...newLetter,
          type: this.normalizeLetterType(newLetter.type),
          away: true
        };
        this.letters.push(letterCopy);
        this.nextLetterId = Math.max(this.nextLetterId, Number(newLetter.id) + 1);
        this.cdr.detectChanges();

        // Brief delay for DOM element positioning
        await this.wait(180);

        const targetPos = this.getTileCenterCoordinates(newLetter.id);
        const slotOwlX = targetPos.x + 43;
        const slotOwlY = targetPos.y + 8;
        const senderName = newLetter.from?.trim() || (newLetter as any).name?.trim() || 'List do Mikołaja';

        // Hedwig arrives from the night sky holding the letter envelope in her beak!
        await this.flyOwlWithLetter(
          window.innerWidth + 180,
          -120,
          slotOwlX,
          slotOwlY,
          senderName,
          2650,
          'deliver',
          true
        );

        // Touchdown: reveal letter envelope and send owl away!
        letterCopy.away = false;
        this.letters = [...this.letters];
        this.cdr.detectChanges();
        this.sendOwlAway(slotOwlX, slotOwlY);
        await this.wait(500);
      }

      // 3. Live-sync gift selection & claim status for existing letters
      for (const incoming of incomingLetters) {
        const local = this.letters.find(l => l.id === incoming.id);
        if (local && !local.away && !local.dementorAttacking) {
          // Wykryj czy jakiś prezent w tym liście został świeżo zaklepany
          const localClaimedIds = new Set((local.gifts || []).filter(g => g.claimed).map(g => g.id));
          const newlyClaimed = (incoming.gifts || []).find(g => g.claimed && !localClaimedIds.has(g.id));
          if (newlyClaimed) {
            this.triggerElfCelebration(incoming.id, newlyClaimed.name);
          }

          local.gifts = incoming.gifts || [];
          local.from = incoming.from;
          local.text = incoming.text;
          local.type = this.normalizeLetterType(incoming.type);

          // Jeśli ten list jest otwarty w trybie podglądu, od razu odśwież jego stan
          if (this.activeLetter && this.activeLetter.id === local.id && !this.isEditing) {
            this.activeLetter.gifts = structuredClone(local.gifts);
          }
        }
      }
      this.cdr.detectChanges();
    } catch (err) {
      console.warn('Silent sky polling check failed', err);
    } finally {
      this.isPolling = false;
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
