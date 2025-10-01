import { Component, ElementRef, OnDestroy, OnInit, ViewChild, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { VideoService } from '../Services/video.service';
import { ProfileDescriptionComponent } from '../profile-description/profile-description.component';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from '../video-chat/video-chat.component';

@Component({
  selector: 'app-chat-component',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, ProfileDescriptionComponent, MatIconModule],
  templateUrl: './chat-component.component.html',
  styleUrl: './chat-component.component.css'
})
export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('chatScroll', { static: false }) chatScrollContainer!: ElementRef;

  messages: any[] = [];
  UserTo: any;
  user = '';
  message = '';
  fromUser = '';
  Receiver = '';
  currentTime = new Date();
  profileClicked: boolean = false;
  status: 'seen' | 'sent' = 'sent';
  isLoader: boolean = true;
  
  private messagePollingInterval: any;
  private isBrowser: boolean;

  constructor(
    private activatedRoute: ActivatedRoute,
    private chatService: ChatService,
    private authSvc: AuthenticationService,
    private signalRService: VideoService,
    private router: Router,
    public dialog: MatDialog,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    this.activatedRoute.paramMap.subscribe(param => {
      this.UserTo = param.get('name');
    });
    this.fromUser = this.authSvc.getUserName();
  }

  async ngOnInit(): Promise<void> {
    // Only initialize in browser
    if (!this.isBrowser) {
      return;
    }

    // Load initial messages
    this.loadMessages();

    // Start SignalR connection
    await this.chatService.startConnection(
      this.fromUser,
      this.onReceiveMessage.bind(this),
      () => { }
    );

    // Reduced polling - only check every 5 seconds as backup
    // (SignalR should handle real-time updates)
    
    // this.messagePollingInterval = setInterval(() => {
    //   this.loadMessages(false); // Silent load without loader
    // }, 5000);
  }

  private loadMessages(showLoader: boolean = true): void {
    if (showLoader) {
      this.isLoader = true;
    }

    this.chatService.getMessages(this.fromUser, this.UserTo).subscribe({
      next: (res: any) => {
        this.messages = res.map((msg: any) => ({
          id: msg.id,
          fromUser: msg.fromUser,
          userTo: msg.userTo,
          message: msg.message,
          created: new Date(msg.created),
          status: msg.status
        })).sort((a: any, b: any) => a.created.getTime() - b.created.getTime());

        if (showLoader) {
          this.isLoader = false;
        }

        setTimeout(() => this.scrollToBottom(), 100);

        // Mark messages as seen
        this.authSvc.markMessagesAsSeen(this.fromUser, this.UserTo).subscribe({
          error: (err) => console.error('Error marking messages as seen:', err)
        });
      },
      error: (err) => {
        console.error('Error loading messages:', err);
        if (showLoader) {
          this.isLoader = false;
        }
      }
    });
  }

  private onReceiveMessage(FromUser: string, userTo: string, message: string, Created: Date, Status: string): void {
    // Only add message if it's relevant to current conversation
    if ((this.UserTo === FromUser && this.fromUser === userTo) || 
        (this.fromUser === FromUser && this.UserTo === userTo)) {
      
      // Check if message already exists (to avoid duplicates)
      const exists = this.messages.some(msg => 
        msg.fromUser === FromUser && 
        msg.userTo === userTo && 
        msg.message === message &&
        Math.abs(new Date(msg.created).getTime() - new Date(Created).getTime()) < 1000
      );

      if (!exists) {
        this.messages.push({ 
          fromUser: FromUser, 
          userTo, 
          message, 
          created: new Date(Created), 
          status: Status 
        });
        
        // Sort messages by date
        this.messages.sort((a, b) => a.created.getTime() - b.created.getTime());
        
        setTimeout(() => this.scrollToBottom(), 100);
      }
    }
  }

  send(): void {
    if (this.message.trim()) {
      this.Receiver = this.UserTo;
      this.currentTime = new Date();
      
      this.chatService.sendMessage(
        this.fromUser, 
        this.UserTo, 
        this.message, 
        this.currentTime, 
        this.status
      );
      
      this.message = '';
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  displayDialog(Userto: string): void {
    if (!this.isBrowser) {
      return;
    }

    this.signalRService.remoteUserId = Userto;
    this.signalRService.isOpen = true;
    
    this.dialog.open(VideoChatComponent, {
      width: '400px',
      height: '550px',
      disableClose: true,
      autoFocus: false
    });
  }

  userDesc(userTo: string): void {
    this.profileClicked = true;
  }

  exitProfile(): void {
    this.profileClicked = false;
  }

  scrollToBottom(): void {
    if (!this.isBrowser) {
      return;
    }

    try {
      if (this.chatScrollContainer?.nativeElement) {
        // Use native Angular approach instead of jQuery
        this.chatScrollContainer.nativeElement.scrollTop = 
          this.chatScrollContainer.nativeElement.scrollHeight;
      } else {
        // Fallback to querySelector if ViewChild isn't ready
        const element = document.getElementById('chat-scroll');
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      }
    } catch (err) {
      console.error('Error scrolling to bottom:', err);
    }
  }

  ngOnDestroy(): void {
    // Clear the polling interval
    if (this.messagePollingInterval) {
      clearInterval(this.messagePollingInterval);
      this.messagePollingInterval = null;
    }

    // Stop SignalR connection
    if (this.isBrowser) {
      this.chatService.stopConnection();
    }

    // Clear data
    this.UserTo = null;
    this.fromUser = '';
    this.messages = [];
  }
}