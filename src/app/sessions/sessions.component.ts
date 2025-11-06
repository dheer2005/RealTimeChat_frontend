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

  constructor(private authSvc: AuthenticationService, private sessionSvc: SessionService, private chatSvc: ChatService, private toastrSvc: ToastrService) {
    this.loadSessions();
  }

  ngOnInit(): void {
    console.log('🎯 Sessions component initialized for user:', this.authSvc.getUserId());
    this.loadSessions();

    // 🔥 IMPORTANT: Wait for SignalR to be connected first
    const checkConnection = setInterval(() => {
      if (this.chatSvc.isConnected()) {
        console.log('✅ SignalR connected, subscribing to session changes...');
        
        this.sessionChangeSub = this.chatSvc.sessionChanged$.subscribe((userID: string) => {
          console.log('🔄 SessionChanged received for:', userID);
          console.log('🔄 Current user:', this.authSvc.getUserId());
          
          if (userID === this.authSvc.getUserId()) {
            console.log('✅ Match! Reloading sessions...');
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

  loadSessions(){
    this.sessionSvc.getAllActiveSession().subscribe({
      next: (res) => {
        this.sessions = res;
        console.log('Active sessions loaded:', this.sessions);
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
        console.log('Logged out from device:', sessionId);
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
        this.sessions = [];
      },
      error: (err) => {
        this.toastrSvc.error('Could not log out from all devices', 'Error');
        console.error('Error logging out from all devices:', err);
      }
    });
  }

}
