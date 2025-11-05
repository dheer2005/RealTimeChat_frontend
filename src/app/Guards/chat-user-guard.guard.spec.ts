import { TestBed } from '@angular/core/testing';
import { CanActivateFn } from '@angular/router';

import { chatUserGuardGuard } from './chat-user-guard.guard';

describe('chatUserGuardGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => chatUserGuardGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});
