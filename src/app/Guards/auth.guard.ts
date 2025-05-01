import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticationService } from '../Services/authentication.service';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const AuthSvc = inject(AuthenticationService);
  const loggedUser = AuthSvc.getUserName();
  if(loggedUser != null){
    return true;
  }else{
    router.navigateByUrl('login');
    return false;
  }
};
