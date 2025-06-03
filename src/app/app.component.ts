import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HomeComponent } from "./home/home.component";
import { LayoutComponent } from "./layout/layout.component";
import { VideoService } from './Services/video.service';
import { AuthenticationService } from './Services/authentication.service';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from './video-chat/video-chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, LayoutComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'RealTimeChatWeb';

  constructor(private signalRService: VideoService, private authService: AuthenticationService, private dialog: MatDialog){}

  ngOnInit(): void {
    if(!this.authService.getToken) return;
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
