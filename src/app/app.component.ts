import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LayoutComponent } from "./layout/layout.component";
import { VideoService } from './Services/video.service';
import { AuthenticationService } from './Services/authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LayoutComponent, CommonModule, FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'RealTimeChatWeb';
  showNavbar = true;
  isLoading = true;

  constructor(private router: Router, 
    private signalRService: VideoService, 
    private authService: AuthenticationService, 
    private dialog: MatDialog
  )
  {
    this.checkRoute(this.router.url);
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: any) => {
      this.checkRoute(event.urlAfterRedirects);
      this.isLoading = false;
    });
    
  }

  private checkRoute(url: string): void {
    const chatRoutes = ['/login', '/register'];
    this.showNavbar = !chatRoutes.some(route => url.startsWith(route));
  }

  ngOnInit(): void {
    if(!this.authService.getToken()) return;
    this.signalRService.startConnection();
  }
  
}
