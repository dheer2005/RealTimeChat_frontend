import { Component, OnDestroy, OnInit } from '@angular/core';
import { AuthenticationService } from '../Services/authentication.service';
import { SessionService } from '../Services/session.service';
import { CommonModule, DatePipe } from '@angular/common';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { ChatService } from '../Services/chat.service';

@Component({
  selector: 'app-sessions',
  standalone: true,
  imports: [CommonModule,DatePipe],
  templateUrl: './sessions.component.html',
  styleUrl: './sessions.component.css'
})
export class SessionsComponent implements OnInit, OnDestroy {
  sessions: any = [];
  private sessionChangeSub!: Subscription;

  constructor(public authSvc: AuthenticationService, private sessionSvc: SessionService, private chatSvc: ChatService, private toastrSvc: ToastrService) {
    this.loadSessions();
  }

  ngOnInit(): void {
    this.loadSessions();

    const checkConnection = setInterval(() => {
      if (this.chatSvc.isConnected()) {
        
        this.sessionChangeSub = this.chatSvc.sessionChanged$.subscribe((userID: string) => {   
          if (userID === this.authSvc.getUserId()) {
            this.loadSessions();
          }
        });
        
        clearInterval(checkConnection);
      }
    }, 500);
  }

  ngOnDestroy(): void {
    if (this.sessionChangeSub) {
      this.sessionChangeSub.unsubscribe();
    }
  }

  getDeviceIcon(deviceInfo: string): string {
    const info = deviceInfo.toLowerCase();

    if (info.includes('android')) return 'fa-mobile-screen';
    if (info.includes('ios') || info.includes('iphone')) return 'fa-mobile';
    if (info.includes('mac')) return 'fa-laptop';
    if (info.includes('windows')) return 'fa-laptop';
    if (info.includes('linux')) return 'fa-desktop';
    
    return 'fa-question-circle';
  }

  loadSessions(){
    this.sessionSvc.getAllActiveSession().subscribe({
      next: (res) => {
        this.sessions = res;
      },
      error: (err:any) => {
        this.toastrSvc.warning('Could not load active sessions', 'Error');
        console.error('Error loading active sessions:', err);
      }
    });
  }

  logoutDevice(sessionId: string) 
  {
    this.sessionSvc.logoutSessionById(sessionId).subscribe({
      next: (res) => {
        this.loadSessions();
      },
      error: (err) => {
        console.error('Error logging out from device:', err);
      }
    });
  }

  logoutAll(){
    this.sessionSvc.logoutFromAllDevices().subscribe({
      next: (res) => {
        this.toastrSvc.success('Logged out from all devices', 'Success');
        this.sessions = this.sessions.filter((s: any) => s.jwtId === this.authSvc.getJwtId());
      },
      error: (err) => {
        this.toastrSvc.error('Could not log out from all devices', 'Error');
        console.error('Error logging out from all devices:', err);
      }
    });
  }

}
