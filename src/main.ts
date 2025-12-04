/// <reference types="@angular/localize" />

import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { PreloadAllModules, provideRouter, withEnabledBlockingInitialNavigation, withPreloading } from '@angular/router';
import { routes } from './app/app.routes';

const extendedConfig = {
  ...appConfig,
  providers: [
    ...appConfig.providers,
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),

      // ✅ Correct way to enable blocking initial navigation
      withEnabledBlockingInitialNavigation()
    )
  ]
};

bootstrapApplication(AppComponent, extendedConfig)
  .catch((err) => console.error(err));
