import { Component, ElementRef, OnDestroy, OnInit, ViewChild, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { VideoService } from '../Services/video.service';
import { ProfileDescriptionComponent } from '../profile-description/profile-description.component';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from '../video-chat/video-chat.component';
import { Subscription } from 'rxjs';
import { NgZone } from '@angular/core';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-chat-component',
  standalone: true,
  imports: [FormsModule, CommonModule, ProfileDescriptionComponent, MatIconModule],
  templateUrl: './chat-component.component.html',
  styleUrl: './chat-component.component.css'
})
export class ChatComponent implements OnInit, OnDestroy {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
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
  isUserTyping: boolean = false;
  isUserOnline: boolean = false;
  userInfo: any;

  isImage: boolean = false;
  mediaUrl: string | null = null;

  showImageModal: boolean = false;
  selectedImage: File | null = null;
  previewUrl: string | null = null;
  imageCaption: string = '';
  showCaptionInput: boolean = false;
  isSending: boolean = false;
  
  private typingSubscription?: Subscription;
  private onlineUsersSubscription?: Subscription;
  private messagesSeenSubscription?: Subscription;
  private typingTimeout: any;
  private isBrowser: boolean;

  constructor(
    private activatedRoute: ActivatedRoute,
    private chatService: ChatService,
    private authSvc: AuthenticationService,
    private signalRService: VideoService,
    public router: Router,
    private ngZone: NgZone,
    private toastrSvc: ToastrService,
    public dialog: MatDialog,
    private location: Location,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    
    this.activatedRoute.paramMap.subscribe(param => {
      this.UserTo = param.get('name');
      this.chatService.setCurrentChatUser(this.UserTo);
      this.authSvc.getUserInfo(this.UserTo!).subscribe({
        next: (res) => {
          this.userInfo = res;
        },
        error: (err) => {
          this.toastrSvc.error(err.error?.message || 'Error fetching user info', 'Error');
        }
      });
    });
    this.fromUser = this.authSvc.getUserName();
  }


  toggleImageModal() {
    this.showImageModal = true;
  }

  closeModal(event?: Event) {
    if (event) {
      this.showImageModal = false;
      this.clearImage();
    }
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        alert('Image size should not exceed 5MB');
        return;
      }

      this.selectedImage = file;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previewUrl = e.target.result;
        this.showCaptionInput = true;
      };
      reader.readAsDataURL(file);
    }
  }

  clearImage() {
    this.selectedImage = null;
    this.previewUrl = null;
    this.imageCaption = '';
    this.showCaptionInput = false;
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }


  ngOnInit(): void {
    if (!this.isBrowser) {
      return;
    }

    this.messagesSeenSubscription = this.chatService.messagesSeen$.subscribe((seenByUser) => {
      if (this.UserTo === seenByUser) {
        this.messages = this.messages.map(msg => {
          if (msg.fromUser === this.authSvc.getUserName() && msg.userTo === this.UserTo) {
            return { ...msg, status: 'seen' };
          }
          return msg;
        });
      }
    });

    this.typingSubscription = this.chatService.typingUsers$.subscribe(
      (typingUsers) => {
        this.isUserTyping = typingUsers[this.UserTo] || false;
      }
    );

    this.onlineUsersSubscription = this.chatService.onlineUsers$.subscribe(
      (users) => {
        const user = users.find(u => u.userName === this.UserTo);
        this.isUserOnline = user?.isOnline || false;
      }
    );

    this.chatService.startConnection(
      this.fromUser,
      this.onReceiveMessage.bind(this),
      () => { }
    ).then(() => {
      this.loadMessages();
    });
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
          status: msg.status,
          isImage: msg.isImage,
          mediaUrl: msg.mediaUrl
        })).sort((a: any, b: any) => a.created.getTime() - b.created.getTime());

        if (showLoader) {
          this.isLoader = false;
        }
        setTimeout(() => this.scrollToBottom(), 100);
        
        this.chatService.markAsSeen(this.fromUser, this.UserTo);
      },
      error: (err) => {
        console.error('Error loading messages:', err);
        if (showLoader) {
          this.isLoader = false;
        }
      }
    });
  }

  private onReceiveMessage(FromUser: string, userTo: string, message: string, Created: Date, Status: string, isImage: boolean, mediaUrl: string | null): void {
    if ((this.UserTo === FromUser && this.fromUser === userTo) || 
        (this.fromUser === FromUser && this.UserTo === userTo)) {
      
      const exists = this.messages.some(msg => 
        msg.fromUser === FromUser && 
        msg.userTo === userTo && 
        msg.message === message &&
        msg.mediaUrl === mediaUrl &&
        Math.abs(new Date(msg.created).getTime() - new Date(Created).getTime()) < 1000
      );

      if (!exists) {
        const finalStatus = (this.UserTo === this.fromUser) ? 'seen' : Status;

        this.messages.push({ 
          fromUser: FromUser, 
          userTo,
          message,
          created: new Date(Created),
          isImage,
          mediaUrl,
          status: finalStatus
        });
        this.messages.sort((a, b) => a.created.getTime() - b.created.getTime());
        
        setTimeout(() => this.scrollToBottom(), 100);
      }
    }
  }

  onInputChange(): void {
    this.chatService.notifyTyping(this.UserTo);

    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.typingTimeout = setTimeout(() => {
      this.chatService.notifyStopTyping(this.UserTo);
    }, 2000);
  }

  

  send(): void {
    this.isSending = true;
    if (this.selectedImage) {
      const formData = new FormData();
      formData.append('file', this.selectedImage);

      this.authSvc.uploadImage(formData).subscribe({
        next: (res: any) => {
          const mediaUrl = res.url;
          
          this.Receiver = this.UserTo;
          this.currentTime = new Date();
          
          if (this.fromUser != this.UserTo) {
            this.chatService.sendMessage(
              this.fromUser,
              this.UserTo,
              this.imageCaption || '',
              this.currentTime,
              this.status,
              true, 
              mediaUrl
            );
          }
          
          this.showImageModal = false;
          this.clearImage();
          
          setTimeout(() => this.scrollToBottom(), 100);

          this.isSending = false;
        },
        error: (err:any) => {
          console.error('Image upload failed', err);
          this.toastrSvc.warning('Failed to upload image. Please try again.');
          this.isSending = false;
        }
      });
    } else if (this.message.trim()) {
      this.isSending = false;
      this.chatService.notifyStopTyping(this.UserTo);
      
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      this.Receiver = this.UserTo;
      this.currentTime = new Date();

      if (this.fromUser != this.UserTo) {
        this.chatService.sendMessage(
          this.fromUser, 
          this.UserTo, 
          this.message, 
          this.currentTime, 
          this.status,
          this.isImage,
          this.mediaUrl
        );
      }
      
      this.message = '';
      setTimeout(() => this.scrollToBottom(), 300);
      this.isSending = false;
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
      maxWidth: '95vw',
      height: '550px',
      maxHeight: '95vh',
      disableClose: true,
      autoFocus: false,
      panelClass: 'video-call-dialog'
    });
  }
  
  userDesc(): void {
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
        this.chatScrollContainer.nativeElement.scrollTop = 
          this.chatScrollContainer.nativeElement.scrollHeight;
      } else {
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
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    if (this.typingSubscription) {
      this.typingSubscription.unsubscribe();
    }

    if (this.onlineUsersSubscription) {
      this.onlineUsersSubscription.unsubscribe();
    }

    if (this.messagesSeenSubscription) {
      this.messagesSeenSubscription.unsubscribe();
    }

    this.UserTo = null;
    this.fromUser = '';
    this.messages = [];
  }

  backToHome(){
    this.chatService.setCurrentChatUser(null);
    this.location.back();
  }
}