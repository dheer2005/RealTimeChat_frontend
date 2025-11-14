import { Component, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { LayoutComponent } from "./layout/layout.component";
import { VideoService } from './Services/video.service';
import { AuthenticationService } from './Services/authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from './video-chat/video-chat.component';
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

  constructor(private router: Router, private signalRService: VideoService, private authService: AuthenticationService, private dialog: MatDialog){
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
    this.startOfferReceive();
  }

  startOfferReceive(){
    this.signalRService.offerReceived.subscribe(async(data)=>{
      if(data){
        // this.dialog.closeAll();
        if(!this.signalRService.isOpen){
          this.signalRService.isOpen = true;
          this.dialog.open(VideoChatComponent,{
            width: '400px',
            height: '600px',
            disableClose:false,
          });
        }
        this.signalRService.remoteUserId = data.from;
        this.signalRService.incomingCall = true;
      }
    })
  }
}
