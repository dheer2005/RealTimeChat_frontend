import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticationService } from '../Services/authentication.service';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const AuthSvc = inject(AuthenticationService);
  if(AuthSvc.getToken()){
    return true;
  }else{
    router.navigate(['/login']);
    return false;
  }
};
