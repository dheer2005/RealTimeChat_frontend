import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { JwtModule } from '@auth0/angular-jwt';
import { provideToastr } from 'ngx-toastr';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(withFetch()),provideAnimations(),provideToastr() ,provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideClientHydration(), importProvidersFrom(
    JwtModule.forRoot({
      config: {
        tokenGetter: () => localStorage.getItem('jwt'),
      }
    })
  ), provideAnimationsAsync()]
};
