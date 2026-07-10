import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, switchMap, map, throwError, forkJoin, interval, startWith } from 'rxjs';
import { OneCallResponse } from './models/weather.models';

export interface CurrentWeather {
  temp: number;
  weather: { description: string; icon: string }[];
}

export interface CurrencyApiResponse {
  data: Record<string, number>;
}

export interface StockSummary {
  symbol: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  preMarket?: number;
  afterHours: number;
  change: number;
  changePct: number;
}

export type MatchStatus = 'LIVE' | 'FT' | 'UPCOMING';

export interface SportTeam {
  teamId: number;
  teamName: string;
  shortName: string;
  teamIconUrl: string;
}

export interface MatchGoal {
  goalGetterName: string;
  goalGetterID: number;
  matchMinute: number;
  scoreTeam1: number;
  scoreTeam2: number;
  isOvertime: boolean;
  isPenalty: boolean;
  isOwnGoal: boolean;
}

export interface MatchResult {
  matchID: number;
  matchDateTime: string;
  matchIsFinished: boolean;
  leagueName: string;
  leagueShortcut: string;
  team1: SportTeam;
  team2: SportTeam;
  matchResults: Array<{
    resultName: string;
    pointsTeam1: number;
    pointsTeam2: number;
    resultOrderID: number; // 1 = half-time, 2 = full-time
  }>;
  goals: MatchGoal[];
}

export interface MatchScore {
  team1: number;
  team2: number;
}

// ── Available leagues ──────────────────────────────────────────────────────

// Replaces the static LEAGUE_OPTIONS constant
export const LEAGUE_OPTIONS: LeagueOption[] = [
  { shortcut: 'bl1', label: 'Bundesliga 1', season: '2025' },
  { shortcut: 'bl2', label: 'Bundesliga 2', season: '2025' },
  { shortcut: 'ucl', label: 'Champions League', season: '2025' },
  { shortcut: 'wm26', label: 'World Cup 2026', season: '2026' }, // ← 2026
  { shortcut: 'wm2026', label: 'World Cup 2026 (US)', season: '2026' }, // ← 2026
  { shortcut: 'dfb', label: 'DFB Pokal', season: '2025' },
];

export interface LeagueOption {
  shortcut: string;
  label: string;
  season: string; // ← added
}

// ── News interfaces (kept identical so component needs zero changes) ───────

export interface NewsArticle {
  article_id: string; // ← Currents `id`
  title: string;
  pubDate: string; // ← Currents `published`
  source_name: string; // ← Currents `author`
  image_url?: string; // ← Currents `image`
  link: string; // ← Currents `url`
}

export interface NewsArticleDetail extends NewsArticle {
  description?: string;
  content?: string;
  creator?: string[];
  keywords?: string[];
  category?: string[];
  country?: string[];
  language?: string;
  full_description?: string;
}

export interface NewsFilters {
  language?: string;
  country?: string;
  category?: string;
  q?: string; // full text search  → Currents `keywords`
  qInMeta?: string; // title-only search → Currents `keywords`
  timeframe?: string;
  page?: string; // page number as string → Currents `page_number`
}

export interface NewsMeta {
  totalResults: number;
  nextPage: string | null;
}

export interface NewsResponse {
  data: NewsArticle[];
  meta: NewsMeta;
}

@Injectable({
  providedIn: 'root',
})
export class NewsReusable {
  private readonly http = inject(HttpClient);

  getWeatherByCity(city: string): Observable<OneCallResponse> {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`;

    return this.http.get<any>(geoUrl).pipe(
      switchMap((geoRes) => {
        const loc = geoRes.results?.[0];
        if (!loc) return throwError(() => new Error(`city "${city}" not found`));

        const { latitude, longitude } = loc;
        const url =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,weathercode` +
          `&daily=temperature_2m_max,temperature_2m_min,weathercode` + // ← removed ,time
          `&timezone=auto`;
        return this.http.get<any>(url);
      }),
      map((res) => this.mapToOneCallResponse(res)),
    );
  }

  private mapToOneCallResponse(res: any): OneCallResponse {
    const current: OneCallResponse['current'] = {
      temp: res.current.temperature_2m,
      weather: [
        {
          description: this.wmoDescription(res.current.weathercode),
          icon: this.wmoIcon(res.current.weathercode),
        },
      ],
    };

    const daily = (res.daily.time as string[]).map((timeStr, i) => ({
      dt: new Date(timeStr).getTime() / 1000,
      temp: {
        day: res.daily.temperature_2m_max[i],
        max: res.daily.temperature_2m_max[i],
        min: res.daily.temperature_2m_min[i],
      },
      weather: [
        {
          description: this.wmoDescription(res.daily.weathercode[i]),
          icon: this.wmoIcon(res.daily.weathercode[i]),
        },
      ],
    }));

    return { current, daily };
  }

  private wmoDescription(code: number): string {
    const map: Record<number, string> = {
      0: 'clear sky',
      1: 'mainly clear',
      2: 'partly cloudy',
      3: 'overcast',
      45: 'fog',
      48: 'icy fog',
      51: 'light drizzle',
      53: 'drizzle',
      55: 'heavy drizzle',
      61: 'light rain',
      63: 'rain',
      65: 'heavy rain',
      71: 'light snow',
      73: 'snow',
      75: 'heavy snow',
      80: 'rain showers',
      81: 'showers',
      82: 'violent showers',
      95: 'thunderstorm',
      99: 'thunderstorm with hail',
    };

    return map[code] ?? 'unknown';
  }

  private wmoIcon(code: number): string {
    if (code === 0) return '01d';
    if (code <= 2) return '02d';
    if (code === 3) return '04d';
    if (code <= 48) return '50d';
    if (code <= 55) return '09d';
    if (code <= 65) return '10d';
    if (code <= 75) return '13d';
    if (code <= 82) return '09d';
    if (code <= 99) return '11d';
    return '01d';
  }
  // Stock market
  private readonly TWELVE_API_KEY = '06926a97bdcc491fbaf4a4d16d221efb';

  getStockSummary(ticker: string, date: string): Observable<StockSummary> {
    const url = `https://api.twelvedata.com/quote?apikey=${this.TWELVE_API_KEY}&symbol=${ticker}`;

    return this.http.get<any>(url).pipe(
      map((res) => {
        const open = +res.open;
        const close = +res.close;
        return {
          symbol: res.symbol,
          open,
          close,
          high: +res.high,
          low: +res.low,
          volume: +res.volume,
          preMarket: res.pre_or_ext_hours_price ? +res.pre_or_ext_hours_price : undefined,
          afterHours: res.extended_change ? +res.extended_change : 0,
          change: +res.change,
          changePct: +res.percent_change,
        };
      }),
    );
  }

  getMultipleStocks(tickers: string[], date: string): Observable<StockSummary[]> {
    return forkJoin(tickers.map((t) => this.getStockSummary(t, date)));
  }

  // ── Sports — OpenLigaDB (new)
  private readonly SPORTS_BASE = 'https://api.openligadb.de';
  private readonly POLL_MS = 60_000; // 60-second live refresh

  getCurrentMatches(leagueShortcut = 'bl1'): Observable<MatchResult[]> {
    return this.http
      .get<MatchResult[]>(`${this.SPORTS_BASE}/getmatchdata/${leagueShortcut}`)
      .pipe(map((matches) => matches ?? []));
  }

  getLiveMatchesPoll(leagueShortcut = 'bl1'): Observable<MatchResult[]> {
    return interval(this.POLL_MS).pipe(
      startWith(0),
      switchMap(() => this.getCurrentMatches(leagueShortcut)),
    );
  }

  /**
   * Specific matchday for a league and season.
   * e.g. getMatchData('bl1', '2025', 32)
   */
  getMatchData(leagueShortcut = 'bl1', season = '2025', matchday = 1): Observable<MatchResult[]> {
    return this.http
      .get<
        MatchResult[]
      >(`${this.SPORTS_BASE}/getmatchdata/${leagueShortcut}/${season}/${matchday}`)
      .pipe(map((matches) => matches ?? []));
  }
  /** Returns '2026' for wm26/wm2026, '2025' for everything else */
  private currentSeason(shortcut: string): string {
    return ['wm26', 'wm2026'].includes(shortcut) ? '2026' : '2025';
  }

  /**
   * Polls getCurrentMatches every 60 s for live score updates.
   * Emits immediately, then repeats on interval.
   */
  getMultipleLeagues(leagueShortcuts: string[]): Observable<MatchResult[][]> {
    return forkJoin(leagueShortcuts.map((l) => this.getCurrentMatches(l))) as Observable<
      MatchResult[][]
    >;
  }

  /**
   * League standings / table.
   * e.g. getLeagueTable('bl1', '2025')
   */
  getLeagueTable(leagueShortcut = 'bl1', season = '2025'): Observable<any[]> {
    return this.http
      .get<any[]>(`${this.SPORTS_BASE}/getbltable/${leagueShortcut}/${season}`)
      .pipe(map((rows) => rows ?? []));
  }

  // ── Sports helper utilities ───────────────────────────────────────────────

  /** Determine if a match is LIVE, FT, or UPCOMING */

  getMatchStatus(match: MatchResult): MatchStatus {
    if (match.matchIsFinished) return 'FT';
    if (new Date() >= new Date(match.matchDateTime)) return 'LIVE';
    return 'UPCOMING';
  }

  getLiveScore(match: MatchResult): MatchScore {
    if (!match.goals?.length) return { team1: 0, team2: 0 };
    const last = match.goals[match.goals.length - 1];
    return {
      team1: last.scoreTeam1,
      team2: last.scoreTeam2,
    };
  }

  getFinalScore(match: MatchResult): MatchScore | null {
    if (!match.matchResults?.length) return null;
    const ft =
      match.matchResults.find((r) => r.resultOrderID === 2) ??
      match.matchResults[match.matchResults.length - 1];
    return ft ? { team1: ft.pointsTeam1, team2: ft.pointsTeam2 } : null;
  }

  getScore(match: MatchResult): MatchScore {
    return match.matchIsFinished
      ? (this.getFinalScore(match) ?? {
          team1: 0,
          team2: 0,
        })
      : this.getLiveScore(match);
  }

  /** Minute of the last goal (for LIVE badge) */
  getMatchMinute(match: MatchResult): number | null {
    return match.goals?.length ? match.goals[match.goals.length - 1].matchMinute : null;
  }

  // ── News — NewsData.io ────────────────────────────────────────────────────

  private readonly CURRENTS_API_KEY = 'PVQKOl5vN1M-Nf20XL2TvHC2hR61B9bpqiKrXOr-GwR4058X';
  private readonly CURRENTS_BASE = 'https://api.currentsapi.services/v1';

  /** Map raw Currents article → shared NewsArticle (component stays unchanged) */
  private mapArticle(a: any): NewsArticle {
    return {
      article_id: a.id,
      title: a.title,
      pubDate: a.published,
      source_name: a.author ?? 'Unknown',
      image_url: a.image ?? undefined,
      link: a.url,
    };
  }

  private mapArticleDetail(a: any): NewsArticleDetail {
    return {
      ...this.mapArticle(a),
      description: a.description,
      content: a.description, // Currents free tier: no separate `content` field
      category: Array.isArray(a.category) ? a.category : [],
      language: a.language,
    };
  }

  getNews(filters: NewsFilters = {}): Observable<NewsResponse> {
    const hasKeywords = !!(filters.q || filters.qInMeta);
    const endpoint = hasKeywords ? '/search' : '/latest-news';

    let params = new HttpParams().set('apiKey', this.CURRENTS_API_KEY);

    if (filters.language) params = params.set('language', filters.language);
    if (filters.country) params = params.set('country', filters.country);
    if (filters.category) params = params.set('category', filters.category);

    // q (full-text) and qInMeta (title) both map to Currents `keywords`
    const keywords = filters.q || filters.qInMeta;
    if (keywords) params = params.set('keywords', keywords);

    // Currents pagination: integer page_number (default 1)
    if (filters.page) params = params.set('page_number', filters.page);

    return this.http.get<any>(`${this.CURRENTS_BASE}${endpoint}`, { params }).pipe(
      map((res) => ({
        data: (res.news ?? []).map((a: any) => this.mapArticle(a)),
        meta: {
          totalResults: res.news?.length ?? 0,
          // Currents returns current page number; increment for next page
          nextPage: res.page != null ? String(Number(res.page) + 1) : null,
        },
      })),
    );
  }

  getNewsDetails(id: string): Observable<NewsArticleDetail> {
    // Currents API has no single-article-by-id endpoint on the free tier.
    // Workaround: keyword-search the id and match exactly, fallback to first result.
    const params = new HttpParams().set('apiKey', this.CURRENTS_API_KEY).set('keywords', id);

    return this.http.get<any>(`${this.CURRENTS_BASE}/search`, { params }).pipe(
      map((res) => {
        const match = (res.news ?? []).find((a: any) => a.id === id) ?? res.news?.[0];
        return this.mapArticleDetail(match);
      }),
    );
  }

  getNewsTopics(): Observable<string[]> {
    // Currents API canonical V2 category list
    return new Observable((observer) => {
      observer.next([
        'general',
        'science_technology',
        'politics_government',
        'economy_business_finance',
        'arts_culture_entertainment',
        'lifestyle_leisure',
        'human_interest',
        'sport',
        'crime_law_justice',
        'education',
        'environment',
        'health',
      ]);
      observer.complete();
    });
  }
}
