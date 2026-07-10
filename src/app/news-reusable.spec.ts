import { TestBed } from '@angular/core/testing';

import { NewsReusable } from './news-reusable';

describe('NewsReusable', () => {
  let service: NewsReusable;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NewsReusable);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
