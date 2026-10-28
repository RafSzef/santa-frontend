import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Gift, Letter, PageResponse } from '../models/santa.models';

@Injectable({
  providedIn: 'root'
})
export class SantaApiService {
  private readonly http = inject(HttpClient);

  private get baseUrl(): string {
    if (typeof window !== 'undefined' && window.location) {
      // Local Angular dev server (ng serve)
      if (window.location.port === '4200') {
        return `http://${window.location.hostname}:8080/api`;
      }
      // Production (Nginx reverse proxy on Oracle Cloud VM / Docker)
      return '/api';
    }
    return 'http://localhost:8080/api';
  }

  verifyPassword(code: string, password: string): Observable<PageResponse> {
    return this.http.post<PageResponse>(`${this.baseUrl}/pages/${encodeURIComponent(code)}/verify`, {
      password
    });
  }

  createPage(code: string, password: string): Observable<PageResponse> {
    return this.http.post<PageResponse>(`${this.baseUrl}/pages`, {
      code,
      password
    });
  }

  checkPageExists(code: string): Observable<{ exists: boolean }> {
    return this.http.get<{ exists: boolean }>(`${this.baseUrl}/pages/${encodeURIComponent(code)}/exists`);
  }

  getPage(code: string): Observable<PageResponse> {
    return this.http.get<PageResponse>(`${this.baseUrl}/pages/${encodeURIComponent(code)}`);
  }

  createLetter(code: string, letter: Partial<Letter>): Observable<Letter> {
    return this.http.post<Letter>(`${this.baseUrl}/pages/${encodeURIComponent(code)}/letters`, letter);
  }

  updateLetter(code: string, letterId: number | string, letter: Partial<Letter>): Observable<Letter> {
    return this.http.put<Letter>(`${this.baseUrl}/pages/${encodeURIComponent(code)}/letters/${letterId}`, letter);
  }

  deleteLetter(code: string, letterId: number | string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/pages/${encodeURIComponent(code)}/letters/${letterId}`);
  }

  claimGift(giftId: number | string, claimed: boolean): Observable<Gift> {
    return this.http.patch<Gift>(`${this.baseUrl}/gifts/${giftId}/claim`, {
      claimed
    });
  }

  selectGift(giftId: number | string, selected: boolean): Observable<Gift> {
    return this.http.patch<Gift>(`${this.baseUrl}/gifts/${giftId}/select`, {
      selected
    });
  }
}
