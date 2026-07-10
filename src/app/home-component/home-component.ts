import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  StockSummary,
  NewsReusable,
  MatchResult,
  LEAGUE_OPTIONS,
  NewsArticle,
  NewsArticleDetail,
  NewsFilters,
  NewsMeta,
} from '../news-reusable';
import { OneCallResponse } from '../models/weather.models';
import { DailyWeather } from '../models/weather.models';
import { DAY_NAMES } from '../models/weather.models';
import { Subscription } from 'rxjs';

export type MatchStatus = 'LIVE' | 'FT' | 'UPCOMING';
type FilterStatus = 'ALL' | MatchStatus;

@Component({
  selector: 'app-home-component',
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home-component.html',
  styleUrl: './home-component.css',
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly svc = inject(NewsReusable);
  private readonly cdr = inject(ChangeDetectorRef);

  // State
  readonly data = signal<OneCallResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly locationLabel = signal('New Delhi, India');
  readonly isChanging = signal(false);
  readonly cityInput = signal('');

  // Derived
  readonly currentTemp = computed(() => Math.round(this.data()?.current.temp ?? 0));

  readonly currentDesc = computed(() => this.data()?.current.weather[0]?.description ?? '');

  readonly currentIcon = computed(() => this.iconUrl(this.data()?.current.weather[0]?.icon));

  /** Next 4 days (skip index 0 = today) */
  readonly forecastDays = computed<DailyWeather[]>(() => {
    const dailyData = this.data()?.daily;
    return (dailyData?.slice(1, 5) as DailyWeather[]) ?? [];
  });

  // Exchange Rate

  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadWeather('New Delhi, India');
    this.loadStocks();
    this.loadSports();
    this.loadTopics();
    this.loadNews();
  }

  ngOnDestroy(): void {
    this.sportsSub?.unsubscribe();
  }
  // ── Exchange Rate Methods

  // ── Weather Methods
  openChange(): void {
    this.isChanging.set(true);
  }

  cancelChange(): void {
    this.isChanging.set(false);
    this.cityInput.set('');
  }

  confirmChange(): void {
    const city = this.cityInput().trim();
    if (!city) return;
    this.locationLabel.set(city);
    this.isChanging.set(false);
    this.cityInput.set('');
    this.loadWeather(city);
  }

  onCityInput(value: string): void {
    this.cityInput.set(value);
  }

  // Helpers
  dayName(dt: number): string {
    return DAY_NAMES[new Date(dt * 1000).getDay()];
  }

  iconUrl(icon?: string): string {
    return icon ? `https://openweathermap.org/img/wn/${icon}@2x.png` : '';
  }

  capitalize(str: string): string {
    return str.charAt(0).toLocaleUpperCase() + str.slice(1);
  }

  // Datafetching

  private loadWeather(city: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.svc.getWeatherByCity(city).subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },

      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load weather.');
        this.loading.set(false);
      },
    });
  }

  // ── Live Sports
  readonly matches = signal<MatchResult[]>([]);
  readonly sportsLoading = signal(true);
  readonly sportsError = signal<string | null>(null);
  readonly activeFilter = signal<FilterStatus>('ALL');
  readonly SelectedLeague = signal('bl1');
  readonly sportsUpdatedAt = signal<Date | null>(null);

  readonly leagues = LEAGUE_OPTIONS;
  readonly sportsFilters: FilterStatus[] = ['ALL', 'LIVE', 'FT', 'UPCOMING'];

  readonly filteredMatches = computed(() => {
    const f = this.activeFilter();
    return f === 'ALL'
      ? this.matches()
      : this.matches().filter((m) => this.svc.getMatchStatus(m) === f);
  });

  readonly liveCount = computed(
    () => this.matches().filter((m) => this.svc.getMatchStatus(m) === 'LIVE').length,
  );

  private sportsSub?: Subscription;

  loadSports(): void {
    this.sportsSub?.unsubscribe();
    this.sportsLoading.set(true);
    this.sportsError.set(null);

    this.sportsSub = this.svc.getLiveMatchesPoll(this.SelectedLeague()).subscribe({
      next: (data) => {
        this.matches.set(data);
        this.sportsLoading.set(false);
        this.sportsUpdatedAt.set(new Date());
        this.cdr.markForCheck();
      },
      error: () => {
        this.sportsError.set('Failed to fecth match data. Please try again.');
        this.sportsLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onLeagueChange(event: Event): void {
    this.SelectedLeague.set((event.target as HTMLSelectElement).value);
    this.loadSports();
  }

  setsSportsFilter(f: FilterStatus): void {
    this.activeFilter.set(f);
  }

  // Delegate to service helpers
  getMatchStatus = (m: MatchResult) => this.svc.getMatchStatus(m);
  getMatchScore = (m: MatchResult) => this.svc.getScore(m);
  getMatchMinute = (m: MatchResult) => this.svc.getMatchMinute(m);

  formatKickoff(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString([], { hour: '2-digit', minute: '2-digit' });
  }

  trackByMatch(_: number, m: MatchResult): number {
    return m.matchID;
  }

  // ── Stock Methods
  readonly stocks = signal<StockSummary[]>([]);
  readonly stocksLoading = signal(false);
  readonly stocksError = signal<string | null>(null);
  readonly stockDate = signal(this.latestTradingDay());

  readonly WATCHED_TICKERS = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA', 'NVDA', 'META'];

  private latestTradingDay(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    // If weekend, roll back to Friday
    if (d.getDay() === 0) d.setDate(d.getDate() - 2);
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }

  loadStocks(): void {
    this.stocksLoading.set(true);
    this.stocksError.set(null);
    this.svc.getMultipleStocks(this.WATCHED_TICKERS, this.stockDate()).subscribe({
      next: (data) => {
        this.stocks.set(data);
        this.stocksLoading.set(false);
      },
      error: (err) => {
        this.stocksError.set(err?.message ?? 'Failed to Load stocks.');
        this.stocksLoading.set(false);
      },
    });
  }

  formatVolume(vol: number): string {
    if (vol >= 1_000_000) return (vol / 1_000_000).toFixed(1) + 'M';
    if (vol >= 1_000) return (vol / 1_000).toFixed(0) + 'K';
    return vol.toString();
  }

  //News
  articles = signal<NewsArticle[]>([]);
  selectedArticle = signal<NewsArticleDetail | null>(null);
  meta = signal<NewsMeta | null>(null);
  booting = signal(false);
  detailbooting = signal(false);
  fault = signal<string | null>(null);

  // Filter state
  searchQuery = '';
  selectedTopic = '';
  selectedLanguage = 'en';
  selectedCountry = '';
  topics = signal<string[]>([]);
  cursorHistory: string[] = [];

  readonly LANGUAGES = [
    { code: 'en', label: 'English' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'es', label: 'Spanish' },
    { code: 'ar', label: 'Arabic' },
    { code: 'pt', label: 'Portuguese' }, // ← new
    { code: 'it', label: 'Italian' }, // ← new
    { code: 'zh', label: 'Chinese' }, // ← new
  ];

  loadTopics(): void {
    this.svc.getNewsTopics().subscribe({
      next: (t) => this.topics.set(t),
      error: () => {},
    });
  }

  loadNews(cursor?: string): void {
    this.booting.set(true);
    this.fault.set(null);
    this.selectedArticle.set(null);

    // Change these filter fields
    const filters: NewsFilters = {
      language: this.selectedLanguage || undefined,
      country: this.selectedCountry || undefined,
      category: this.selectedTopic || undefined,
      qInMeta: this.searchQuery || undefined, // title-only search
      page: cursor,
    };

    this.svc.getNews(filters).subscribe({
      next: (res) => {
        this.articles.set(res.data);
        this.meta.set(res.meta);
        this.booting.set(false);
      },
      error: (err: unknown) => {
        console.error('News API error:', err);
        this.fault.set('Failed to load news. Please try again.');
        this.booting.set(false);
      },
    });
  }

  onSearch(): void {
    this.cursorHistory = [];
    this.loadNews();
  }

  onFilterChange(): void {
    this.cursorHistory = [];
    this.loadNews();
  }

  // Instead of calling the API again, find from already loaded articles
  openArticle(id: string): void {
    // First try to find in already-loaded articles (saves an API call)
    const cached = this.articles().find((a) => a.article_id === id);
    if (cached) {
      this.selectedArticle.set(cached as NewsArticleDetail);
      return;
    }

    // Fallback to API if not found in cache
    this.detailbooting.set(true);
    this.svc.getNewsDetails(id).subscribe({
      next: (detail) => {
        this.selectedArticle.set(detail);
        this.detailbooting.set(false);
      },
      error: () => {
        this.detailbooting.set(false);
      },
    });
  }

  // In nextPage()

  nextPage(): void {
    const currentMeta = this.meta();
    if (!currentMeta?.nextPage) return;
    this.cursorHistory.push(currentMeta.nextPage);
    this.loadNews(currentMeta.nextPage);
  }

  prevPage(): void {
    this.cursorHistory.pop();
    const prev =
      this.cursorHistory.length > 0 ? this.cursorHistory[this.cursorHistory.length - 1] : undefined; // undefined = page 1 (default)
    this.loadNews(prev);
  }

  closeArticle(): void {
    this.selectedArticle.set(null);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  formatTopic(topic: string): string {
    return topic.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}
