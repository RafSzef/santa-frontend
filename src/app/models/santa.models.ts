export type LetterType = 'standard' | 'child';

export interface Gift {
  id?: string;
  name: string;
  url: string;
  selected?: boolean;
  claimed?: boolean;
}

export interface Letter {
  id: number;
  from: string;
  text: string;
  type: LetterType;
  gifts: Gift[];
  away?: boolean;
  removing?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
  type: 'ember' | 'spark' | 'gold' | 'smoke' | 'scrap';
  rotation?: number;
  vRot?: number;
  wobbleSpeed?: number;
}

export interface OwlFlight {
  id: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  cargoName?: string;
  cargoLetter?: Letter;
  duration: number;
  mode: 'deliver' | 'pickup' | 'carry-climb' | 'leave' | 'ambient';
}

export interface PasswordChar {
  id: number;
  char: string;
  dissolved: boolean;
}
