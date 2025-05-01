import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { JwtModule } from '@auth0/angular-jwt';
import { provideToastr } from 'ngx-toastr';
import { provideAnimations } from '@angular/platform-browser/animations';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(),provideAnimations(),provideToastr() ,provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideClientHydration(), importProvidersFrom(
    JwtModule.forRoot({
      config: {
        tokenGetter: () => localStorage.getItem('jwt'),
      }
    })
  )]
};
