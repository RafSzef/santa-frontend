import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render floating placeholder', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.floating-placeholder')?.textContent).toContain('Podaj hasło');
  });

  it('should keep gift link clickable after elf stamp in child letters', async () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    app.phase = 'main';
    app.isEditing = false;
    app.activeLetter = {
      id: 1,
      from: 'Zosia',
      text: 'Drogi Mikołaju...',
      type: 'child',
      gifts: [
        { id: 10, name: 'Klocki LEGO', url: 'example.com/lego', claimed: true },
        { id: 11, name: 'Pluszowy miś', url: '', claimed: true },
      ],
    };
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const link = compiled.querySelector('.gift-storybook-link') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://example.com/lego');
    expect(link?.classList.contains('claimed-strikethrough')).toBe(true);
    expect(compiled.querySelector('.gift-storybook-name.claimed-strikethrough')?.textContent).toContain('Pluszowy miś');
  });
});
