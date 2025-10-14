import { Component, ElementRef, OnDestroy, OnInit, ViewChild, Inject, PLATFORM_ID, HostListener } from '@angular/core';
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
import { PickerComponent } from '@ctrl/ngx-emoji-mart';


@Component({
  selector: 'app-chat-component',
  standalone: true,
  imports: [FormsModule, CommonModule, ProfileDescriptionComponent, MatIconModule, PickerComponent],
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

  showImageViewModal = false;
  selectedImageUrl: string | null = null;
  selectedImageCaption: string | null = null;
  selectedImageTime: Date | null = null;
  
  private typingSubscription?: Subscription;
  private onlineUsersSubscription?: Subscription;
  private messagesSeenSubscription?: Subscription;
  private reactionAddedSubscription?: Subscription;
  private reactionRemovedSubscription?: Subscription;

  private typingTimeout: any;
  private isBrowser: boolean;

  isDragOver: boolean = false;
  mapStaticImageUrl: any = `https://res.cloudinary.com/ddvzeseip/image/upload/v1760094391/Chatlify/ap_a6v2ac.png`;


  showLocationModal: boolean = false;
  map!: any;
  marker!: any;
  selectedLat!: number | null;
  selectedLon!: number | null;
  isLoadingLocation: boolean = false;

  showEmojiPicker: boolean = false;
  showAttachmentMenu = false;
  currentUser = this.authSvc.getUserName();

  reactionOptions = ['❤️', '👍', '😂', '😮', '😢'];

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

    this.reactionAddedSubscription = this.chatService.reactionAdded$.subscribe(({messageId, emoji, user})=>{
      const msg = this.messages.find(m=>m.id === messageId);
      if(msg){
        msg.reactions = msg.reactions || [];
        const existing = msg.reactions.find((r:any)=>r.User === user);
        if(existing) existing.Emoji = emoji;
        else msg.reactions.push({User: user, Emoji: emoji});
      }
    });

    this.reactionRemovedSubscription = this.chatService.reactionRemoved$.subscribe(({ messageId, user }) => {
      const msg = this.messages.find(m => m.id === messageId);
      if (msg && msg.reactions) {
        msg.reactions = msg.reactions.filter((r: any) => r.User !== user);
      }
    });

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
          mediaUrl: msg.mediaUrl,
          reactions: msg.reactions ? JSON.parse(msg.reactions) : []
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

  showReactionMenu(msg: any) {
    msg.showReactions = true;
  }

  hideReactionMenu(msg: any) {
    msg.showReactions = false;
  }

  addReaction(msg: any, emoji: string) {
    const existing = msg.reactions?.find((r: any) => r.user === this.currentUser);
    if (existing) {
      if (existing.emoji != emoji) {
        this.chatService.addReaction(msg.id, emoji, this.currentUser);
        return;
      }
    } else {
      this.chatService.addReaction(msg.id, emoji, this.currentUser);
    }
  }

  removeReaction(msg: any, react: any) {
    this.chatService.removeReaction(msg.id, this.currentUser);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.attachment-container')) {
      this.showAttachmentMenu = false;
    }
  }
  
  toggleAttachmentMenu() {
    this.showAttachmentMenu = !this.showAttachmentMenu;
  }

  toggleEmojiPicker() {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  addEmoji(event: any) {
    this.message += event.emoji.native;
  }

  openLocationModal() {
    this.showLocationModal = true;

    setTimeout(() => { 
      if (!this.map) {
        this.initMap();
      } else {
        this.map.invalidateSize();
      }
    }, 100);
  }

  destroyMap() {
    if (this.map) {
      this.map.remove();
      this.map = null;
      this.marker = null;
    }
  }

  async initMap() {
    if(!this.isBrowser)
      return;
     if (this.map) {
        this.map.remove();
        this.map = null;
      }

    const L = await  import('leaflet');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.selectedLat = pos.coords.latitude;
        this.selectedLon = pos.coords.longitude;

        this.map = L.map('map').setView([this.selectedLat, this.selectedLon], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        this.marker = L.marker([this.selectedLat, this.selectedLon], { draggable: true }).addTo(this.map);

        this.marker.on('dragend', (e: any) => {
          const latLng = e.target.getLatLng();
          this.selectedLat = latLng.lat;
          this.selectedLon = latLng.lng;
        });
      },
      (err) => {
        console.warn('Geolocation failed, using default location');
        this.selectedLat = 28.6139; 
        this.selectedLon = 77.2090;

        this.map = L.map('map').setView([this.selectedLat, this.selectedLon], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors'
        }).addTo(this.map);

        this.marker = L.marker([this.selectedLat, this.selectedLon], { draggable: true }).addTo(this.map);
        this.marker.on('dragend', (e: any) => {
          const latLng = e.target.getLatLng();
          this.selectedLat = latLng.lat;
          this.selectedLon = latLng.lng;
        });
      }
    );
  }

  sendCurrentLocation() {
    if (!navigator.geolocation) {
      this.toastrSvc.warning('Geolocation not supported');
      return;
    }

    this.isLoadingLocation = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        this.sendLocation(lat, lng, 'Shared current Location');
        this.isLoadingLocation = false;
        this.closeLocationModal();
        this.destroyMap();
      },
      (err) => {
        this.isLoadingLocation = false;
        this.destroyMap();
        this.toastrSvc.error('Failed to get current location');
      },
      { enableHighAccuracy: true }
    );
  }

  sendSelectedLocation() {
    if (!this.selectedLat || !this.selectedLon) {
      this.toastrSvc.warning('Please select a location on the map');
      return;
    }
    this.sendLocation(this.selectedLat, this.selectedLon, 'Shared Location');
    this.closeLocationModal();
  }

  sendLocation(lat: number, lng: number, caption: string) {
    const osmStaticUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=400x200&markers=${lat},${lng},red-pushpin`;
    const now = new Date();

    this.chatService.sendMessage(
      this.fromUser,
      this.UserTo,
      caption,
      now,
      'sent',
      true,
      osmStaticUrl
    );

    this.messages.push({
      fromUser: this.fromUser,
      userTo: this.UserTo,
      message: caption,
      created: now,
      isImage: true,
      mediaUrl: osmStaticUrl,
      status: 'sent'
    });

    setTimeout(() => this.scrollToBottom(), 100);
  }

  closeLocationModal() {
    this.showLocationModal = false;
    this.selectedLat = null;
    this.selectedLon = null;
    this.destroyMap();
  }

  onDragOver(event: DragEvent) : void{
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = true;
  }

  onDragLeave(event: DragEvent): void{
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
  }

  onFileDrop(event: DragEvent) : void{
    console.log('File dropped');
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    this.showImageModal = true;

    if(event.dataTransfer && event.dataTransfer.files.length > 0){
      const file = event.dataTransfer.files[0];

      if(!file.type.startsWith('image/')){
        this.toastrSvc.warning('Please drop a valid image file', 'Invalid File');
        return;
      }

      if(file.size > 5 * 1024 * 1024){
        this.toastrSvc.warning('Image size should not exceed 5MB', 'File Too Large');
        return;
      }

      this.selectedImage = file;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.previewUrl = e.target.result;
        this.showCaptionInput = true;
      };
      reader.readAsDataURL(file);

      event.dataTransfer.clearData();
    }

  }

  openImagePreviewViewModal(msg: any) {
    this.selectedImageUrl = msg.mediaUrl;
    this.selectedImageCaption = msg.message;
    this.selectedImageTime = msg.created;
    this.showImageViewModal = true;
  }

  closeImagePreviewViewModal() {
    this.showImageViewModal = false;
    this.selectedImageUrl = null;
    this.selectedImageCaption = null;
    this.selectedImageTime = null;
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

  

  private onReceiveMessage(Id: number, FromUser: string, userTo: string, message: string, Created: Date, Status: string, isImage: boolean, mediaUrl: string | null): void {
    if ((this.UserTo === FromUser && this.fromUser === userTo) || 
        (this.fromUser === FromUser && this.UserTo === userTo)) {

      const exists = this.messages.some(m=> m.id === Id );

      if (!exists) {
        const finalStatus = (this.UserTo === this.fromUser) ? 'seen' : Status;

        this.messages.push({ 
          id: Id,
          fromUser: FromUser, 
          userTo,
          message,
          created: new Date(Created),
          isImage,
          mediaUrl,
          status: finalStatus,
          reactions: []
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

    // if (this.onlineUsersSubscription) {
    //   this.onlineUsersSubscription.unsubscribe();
    // }

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