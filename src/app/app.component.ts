import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LayoutComponent } from "./layout/layout.component";
import { VideoService } from './Services/video.service';
import { AuthenticationService } from './Services/authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { filter } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioService } from './Services/audio.service';

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

  constructor(private router: Router, private audioService: AudioService, private signalRService: VideoService, private authService: AuthenticationService, private dialog: MatDialog){
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event:any)=>{
      if(event.urlAfterRedirects === '/login' || event.urlAfterRedirects === '/register'){
        this.showNavbar = false;
      }else{
        this.showNavbar = true;
      }
    })
  }

  ngOnInit(): void {
    if(!this.authService.getToken()) return;
    this.signalRService.startConnection();
  }
  
}
