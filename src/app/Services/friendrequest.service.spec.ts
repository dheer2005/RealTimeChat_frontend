import { TestBed } from '@angular/core/testing';

import { FriendrequestService } from './friendrequest.service';

describe('FriendrequestService', () => {
  let service: FriendrequestService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FriendrequestService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
