import { Component, ElementRef, OnDestroy, OnInit, ViewChild, HostListener, AfterViewChecked } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { VideoService } from '../Services/video.service';
import { ProfileDescriptionComponent } from '../profile-description/profile-description.component';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from '../video-chat/video-chat.component';
import { Subscription } from 'rxjs';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { AudioService } from '../Services/audio.service';
import { AudioChatComponent } from '../audio-chat/audio-chat.component';
import { AlertService } from '../Services/alert.service';
import * as L from 'leaflet';


@Component({
  selector: 'app-chat-component',
  standalone: true,
  imports: [FormsModule, CommonModule, ProfileDescriptionComponent, MatIconModule, PickerComponent],
  templateUrl: './chat-component.component.html',
  styleUrl: './chat-component.component.css'
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('chatScroll', { static: false }) chatScrollContainer!: ElementRef;
  @ViewChild('messageInput') messageInputRef!: ElementRef<HTMLInputElement>;
  

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

  private deleteMessageSubscription?: Subscription;

  private typingTimeout: any;

  isDragOver: boolean = false;
  mapStaticImageUrl: any = `https://res.cloudinary.com/ddvzeseip/image/upload/v1760094391/Chatlify/ap_a6v2ac.png`;


  showLocationModal: boolean = false;
  map: any = null;
  marker: any = null;
  selectedLat: number | null = null;
  selectedLon: number | null = null;
  isLoadingLocation: boolean = false;
  isMapInitialized: boolean = false;


  showEmojiPicker: boolean = false;
  showAttachmentMenu = false;
  currentUser = this.authSvc.getUserName();

  reactionOptions = ['❤️', '👍', '😂', '😮', '😢'];

  mediaTab: 'info' | 'media' = 'info';
  mediaInnerTab: 'images' | 'videos' | 'files' = 'images';
  chatImagesByDate: { label: string; images: any[] }[] = [];
  chatVideosByDate: { label: string; videos: any[] }[] = [];
  chatFilesByDate: { label: string; files: any[] }[] = [];

  showContextMenu = false;
  selectedMediaUrl: string | null = null;
  selectedMediaType: 'image' | 'video' | 'file' | null = null;
  replyingToMessage: any = null;

  selectedMsgId: number | null = null;
  showMsgContextMenu: boolean = false;
  contextMenuPosition = { x: 0, y: 0 };
  previewType: string = '';
  previewFileName: string = '';

  showScrollButton: boolean = false;
  private userScrolled: boolean = false;


  constructor(
    private activatedRoute: ActivatedRoute,
    private chatService: ChatService,
    private audioService: AudioService,
    private authSvc: AuthenticationService,
    private signalRService: VideoService,
    public router: Router,
    private toastrSvc: AlertService,
    public dialog: MatDialog,
    private location: Location
  ) {
    
    this.activatedRoute.paramMap.subscribe(param => {
      this.UserTo = param.get('name');
      this.chatService.setCurrentChatUser(this.UserTo);
      this.authSvc.getUserInfo(this.UserTo!).subscribe({
        next: (res) => {
          this.userInfo = res;
        },
        error: (err) => {
          this.toastrSvc.error(err.error?.message || 'Error fetching user info');
        }
      });
    });
    this.fromUser = this.authSvc.getUserName();
  }

  handleInputChange(): void {
    this.autoResize();
    this.onInputChange();
  }

  getDateLabel(date: Date): string {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const sameDay = (a: Date, b: Date) =>
      a.getDate() === b.getDate() &&
      a.getMonth() === b.getMonth() &&
      a.getFullYear() === b.getFullYear();

    if (sameDay(date, today)) return 'Today';
    if (sameDay(date, yesterday)) return 'Yesterday';

    return date.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  }

  autoResize(): void {
    const textarea = this.messageInputRef?.nativeElement;
    if (!textarea) return;

    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  replyToMessage(msg: any) {
    this.replyingToMessage = msg;
    this.showMsgContextMenu = false;

    setTimeout(()=>{
      this.messageInputRef.nativeElement.focus();
    }, 0);
  }

  cancelReply() {
    this.replyingToMessage = null;
  }

  onMsgRightClick(event: MouseEvent, msg: any) {
    event.preventDefault();
    event.stopPropagation();
    
    this.selectedMsgId = msg.id;
    this.showMsgContextMenu = true;

    const menuWidth = 150; 
    const menuHeight = 120; 
    const padding = 10;

    let x = event.clientX;
    let y = event.clientY;

    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }
    
    if (x < padding) {
      x = padding;
    }

    if (y < padding) {
      y = padding;
    }

    this.contextMenuPosition = { x, y };

    setTimeout(() => {
      const menu = document.querySelector('.msg-context-menu') as HTMLElement;
      if (menu) {
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
      }
    }, 0);
  }

  copyMessage(msg: any){
    navigator.clipboard.writeText(msg)
    .then(()=>{
      this.toastrSvc.success("Copied");
    })
    .catch(err=>{
      this.toastrSvc.warning("Failed to copy message:");
    })
  }

  onRightClick(event: MouseEvent, mediaUrl: string, id: number, type: 'image' | 'video' | 'file') {
    event.preventDefault();
    event.stopPropagation();
    this.selectedMediaUrl = mediaUrl;
    this.selectedMediaType = type;
    this.showContextMenu = true;

  }
  viewMedia(type: 'image' | 'video', item: any) {
    this.showContextMenu = false;
    if (type === 'image') {
      this.openImagePreviewViewModal(item);
    } else if (type === 'video') {
      // this.openVideoPreview(item);
    }
  }

  openVideoPreview(item: any){
    
  }

  goToMessage(messageId: number, image?: any) {
    this.showContextMenu = false;
    this.profileClicked = false;

    setTimeout(() => {
      const chatContainer = document.getElementById('chat-scroll');
        
      if (!chatContainer) return;

      const messages = chatContainer.querySelectorAll('.message-wrapper');
      let targetMessage: HTMLElement | undefined;

      messages.forEach((msg: Element) => {
          const imgElement = msg.querySelector(`img[src="${image}"]`);
          if (imgElement) {
              targetMessage = msg as HTMLElement;
          }
      });

      if (!targetMessage) {
        targetMessage = document.getElementById('msg-' + messageId) as HTMLElement | undefined;
      }

      if (targetMessage) {
        targetMessage.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
        });

        targetMessage.style.backgroundColor = 'rgba(255, 255, 0, 0.2)';
        setTimeout(() => {
            targetMessage!.style.backgroundColor = '';
        }, 2000);
      }
    }, 300);
  }

  deleteMsg(msgId:number){
    this.chatService.deleteMessage(msgId);
    this.showMsgContextMenu = false;
  }

  private groupMediaByDate<T extends 'image' | 'video' | 'file'>( media: any[], type: T): T extends 'image' ? { label: string; images: any[] }[] 
  : T extends 'video' ? { label: string; videos: any[] }[] : { label: string; files: any[] }[] {
    const grouped : {[key: string]: any[]} = {};

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate()-1);

    for(const item of media){

      if (item.mediaUrl && item.mediaUrl.includes('staticmap.openstreetmap.de')) continue;
      
      if(type === 'image' && !item.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)) continue;
      if(type === 'video' && !item.mediaUrl.match(/\.(mp4|mov|avi|mkv|webm)$/i)) continue;
      if(type === 'file' && item.mediaUrl.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov|avi|mkv|webm)$/i)) continue;

      let fileName: string | undefined;
      if(type == 'file'){
        fileName = item.fileName || decodeURIComponent(item.mediaUrl.split('/').pop() || 'Unknown File');
      }

      const date = new Date(item.created || item.Created || item.timestamp || item.createdAt);
      const dateKey = date.toDateString();

      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(type === 'file' ? { ...item, fileName} : item);
    }

    const sortedGroups = Object.keys(grouped)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(dateKey => {
        const date = new Date(dateKey);
        let label = date.toDateString() === today.toDateString()
          ? 'Today'
          : date.toDateString() === yesterday.toDateString()
          ? 'Yesterday'
          : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        

        if (type === 'image') {
          return { label, images: grouped[dateKey] };
        } else if (type === 'video') {
          return { label, videos: grouped[dateKey] };
        } else {
          return { label, files: grouped[dateKey] };
        }
      });

      return sortedGroups as any;
  }

  ngAfterViewChecked() {
    if (this.showLocationModal && this.map) {
      setTimeout(() => {
        this.map.invalidateSize();
      }, 600);
    }

    if (this.chatScrollContainer?.nativeElement && !this.chatScrollContainer.nativeElement.dataset.scrollListenerAdded) {
      this.chatScrollContainer.nativeElement.addEventListener('scroll', (event: Event) => {
        const element = event.target as HTMLElement;
        const threshold = 150;
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
        
        this.showScrollButton = !atBottom;
        this.userScrolled = !atBottom;
      });
      this.chatScrollContainer.nativeElement.dataset.scrollListenerAdded = 'true';
    }
  }

  ngOnInit(): void {

    this.messagesSeenSubscription = this.chatService.messagesSeen$.subscribe((seenByUser) => {
      if (this.UserTo === seenByUser) {
        this.messages.forEach(msg => {
          if (msg.fromUser === this.authSvc.getUserName() && msg.userTo === this.UserTo) {
            msg.status = 'seen';
          }
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

    this.deleteMessageSubscription = this.chatService.messageDelete$.subscribe(msdId =>{
      this.messages = this.messages.filter(m=>m.id != msdId);
    })

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

    this.chatService.getMessages(this.UserTo).subscribe({
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
          reactions: msg.reactions ? JSON.parse(msg.reactions) : [],
          replyTo: msg.replyTo ? {
            id: msg.replyTo.id,
            message: msg.replyTo.message,
            mediaUrl: msg.replyTo.mediaUrl,
            isImage: msg.replyTo.isImage
          } : null
        })).sort((a: any, b: any) => a.created.getTime() - b.created.getTime());

        const allMedia = this.messages.filter((m: any) => m.mediaUrl);
        this.chatImagesByDate = this.groupMediaByDate(allMedia, 'image');
        this.chatVideosByDate = this.groupMediaByDate(allMedia, 'video');
        this.chatFilesByDate = this.groupMediaByDate(allMedia, 'file');
        
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

    if (!target.closest('.msg-context-menu') && !target.closest('.message-bubble')) {
      this.showMsgContextMenu = false;
      this.selectedMsgId = null;
    }

    if (!target.closest('.context-menu')) {
      this.showContextMenu = false;
      this.selectedMediaUrl = null;
      this.selectedMediaType = null;
    }

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
    this.isMapInitialized = false;

    setTimeout(() => { 
      this.initMap();
    }, 300); 
  }

  destroyMap() {
    if (this.map) {
      try {
        this.map.remove();
      } catch (error) {
        console.error('Error removing map:', error);
      }
      this.map = null;
      this.marker = null;
    }
    this.isMapInitialized = false;
  }

  async initMap() {
    try {
      if (this.map) {
        this.map.remove();
        this.map = null;
        this.marker = null;
      }

      const mapContainer = document.getElementById('map');

      if (!mapContainer) {
        console.error('Map container not found');
        setTimeout(() => this.initMap(), 200);
        return;
      }

      const newContainer = mapContainer.cloneNode(true) as HTMLElement;
      mapContainer.replaceWith(newContainer);

      const DefaultIcon = L.icon({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        shadowSize: [41, 41]
      });
      L.Marker.prototype.options.icon = DefaultIcon;

      const getLocation = (): Promise<{ lat: number; lng: number }> => {
        return new Promise((resolve, reject) => {
          if (!navigator.geolocation) {
            resolve({ lat: 28.6139, lng: 77.2090 });
            return;
          }

          navigator.geolocation.getCurrentPosition(
            (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
            () => resolve({ lat: 28.6139, lng: 77.2090 }),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        });
      };

      const { lat: initialLat, lng: initialLng } = await getLocation();

      this.selectedLat = initialLat;
      this.selectedLon = initialLng;

      this.map = L.map(newContainer, {
        center: [initialLat, initialLng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: true
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }).addTo(this.map);

      this.marker = L.marker([initialLat, initialLng], {
        draggable: true,
        autoPan: true
      }).addTo(this.map);

      this.marker.on('dragend', (e: any) => {
        const latlng = e.target.getLatLng();
        this.selectedLat = latlng.lat;
        this.selectedLon = latlng.lng;
      });
      
      this.map.on('click', (e: any) => {
        this.selectedLat = e.latlng.lat;
        this.selectedLon = e.latlng.lng;
        this.marker.setLatLng(e.latlng);
      });

      setTimeout(() => this.map?.invalidateSize(), 500);

    } catch (error) {
      console.error('Error initializing map:', error);
      this.toastrSvc.error('Failed to load map. Please try again.');
    }
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
      },
      (err) => {
        this.isLoadingLocation = false;
        console.error('Geolocation error:', err);
        
        let errorMessage = 'Failed to get current location';
        if (err.code === 1) {
          errorMessage = 'Location permission denied';
        } else if (err.code === 2) {
          errorMessage = 'Location unavailable';
        } else if (err.code === 3) {
          errorMessage = 'Location request timeout';
        }
        
        this.toastrSvc.error(errorMessage);
      },
      { 
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
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

    setTimeout(() => this.scrollToBottom(), 100);
    this.showAttachmentMenu = false;
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
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver = false;
    this.showImageModal = true;

    if(event.dataTransfer && event.dataTransfer.files.length > 0){
      const file = event.dataTransfer.files[0];

      const type = file.type;

      this.selectedImage = file;

      if (type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.previewUrl = e.target.result;
          this.previewType = 'image';
        };
        reader.readAsDataURL(file);
      } else if (type.startsWith('video/')) {
        this.previewUrl = URL.createObjectURL(file);
        this.previewType = 'video';
      } else {
        this.previewUrl = null;
        this.previewType = 'file';
        this.previewFileName = file.name;
      }

      this.showCaptionInput = true

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

  downloadFile(url: string) {
    if (!url) return;

    const downloadUrl = url.replace('/upload/', '/upload/fl_attachment/');

    const link = document.createElement('a');
    link.href = downloadUrl;
    link.target = '_blank';
    link.click();
  }

  isFile(url?: string): boolean {
    if (!url) return false;
    return url.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|zip|rar)$/i) !== null;
  }

  ImageOrNot(url?: string): boolean {
    if (!url) return false;
    return url.match(/\.(jpeg|jpg|png|gif|webp)$/i) !== null;
  }

  isVideo(url?: string): boolean {
    if (!url) return false;
    return url.match(/\.(mp4|mov|avi|webm|mkv)$/i) !== null;
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      const type = file.type;

      this.selectedImage = file;

      if (type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.previewUrl = e.target.result;
          this.previewType = 'image';
        };
        reader.readAsDataURL(file);
      } else if (type.startsWith('video/')) {
        this.previewUrl = URL.createObjectURL(file);
        this.previewType = 'video';
      } else {
        this.previewUrl = null;
        this.previewType = 'file';
        this.previewFileName = file.name;
      }

      this.showCaptionInput = true;
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

  private onReceiveMessage(Id: number, FromUser: string, userTo: string, message: string, Created: Date, Status: string, isImage: boolean, mediaUrl: string | null, replyTo?: { id: number, message: string, mediaUrl: string | null, isImage: boolean } | null): void {
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
          reactions: [],
          replyToMessageId: replyTo ? replyTo.id : null,
          replyTo: replyTo ? {
            id: replyTo.id,
            message: replyTo.message,
            mediaUrl: replyTo.mediaUrl,
            isImage: replyTo.isImage
          } : null
        });
        this.messages.sort((a, b) => a.created.getTime() - b.created.getTime());

        if (mediaUrl) {
          if(mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i)){
            this.chatImagesByDate = this.groupMediaByDate([...this.chatImagesByDate.flatMap(x => x.images), { id: Id, mediaUrl, created: Created }], 'image');
          }else if(mediaUrl.match(/\.(mp4|mov|avi|mkv|webm)$/i)){
            this.chatVideosByDate = this.groupMediaByDate([...this.chatVideosByDate.flatMap(x=>x.videos), {id: Id, mediaUrl, created: Created}], 'video')
          }else{
            const fileName = mediaUrl ? decodeURIComponent(mediaUrl.split('/').pop() || 'Unknown File') : 'Unknown File';
            this.chatFilesByDate = this.groupMediaByDate([...this.chatFilesByDate.flatMap(x=>x.files), {id: Id, mediaUrl, fileName, created: Created}], 'file')

          }
        }

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
    if (this.isSending) return;
    this.isSending = true;
    if (this.selectedImage) {
      const formData = new FormData();
      formData.append('file', this.selectedImage);

      this.authSvc.uploadImage(formData).subscribe({
        next: (res: any) => {
          const mediaUrl = res.url;

          this.Receiver = this.UserTo;
          this.currentTime = new Date();

          const replyToId = this.replyingToMessage ? this.replyingToMessage.id : null;
          
          if (this.fromUser != this.UserTo) {
            this.chatService.sendMessage(
              this.fromUser,
              this.UserTo,
              this.imageCaption || '',
              this.currentTime,
              this.status,
              true, 
              mediaUrl,
              replyToId
            );

          }
          this.replyingToMessage = null;
          
          this.showImageModal = false;
          this.clearImage();

          setTimeout(() => this.scrollToBottom(), 100);

          this.showAttachmentMenu = false;
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

      const replyToId = this.replyingToMessage ? this.replyingToMessage.id : null;

      if (this.fromUser != this.UserTo) {
        this.chatService.sendMessage(
          this.fromUser, 
          this.UserTo, 
          this.message, 
          this.currentTime, 
          this.status,
          this.isImage,
          this.mediaUrl,
          replyToId
        );
      }

      this.replyingToMessage = null;
      
      this.message = '';

      const textarea = this.messageInputRef?.nativeElement;
      if(textarea){
        textarea.style.height = 'auto';
      }

      setTimeout(() => this.scrollToBottom(), 100);
      this.isSending = false;
    }
    else{
      this.isSending = false;
    }
  }

  displayAudioDialog(UserTo: string): void {
    if (this.audioService.isOpen) {
      return;
    }
    
    if (!this.audioService.hubConnection || 
        this.audioService.hubConnection.state !== 'Connected') {
      
      this.audioService.startConnection().then(() => {
        this.initiateAudioCall(UserTo);
      }).catch(err => {
        console.error('Failed to start audio connection:', err);
        this.toastrSvc.error('Failed to initialize audio call');
      });
    } else {
      this.initiateAudioCall(UserTo);
    }
  }

  private initiateAudioCall(UserTo: string): void {
    this.audioService.remoteUserId = UserTo;
    this.audioService.isOpen = true;
    this.audioService.incomingCall = false; 
    this.audioService.isCallActive = false;

    this.dialog.open(AudioChatComponent, {
      width: '400px',
      maxWidth: '95vw',
      height: '500px',
      maxHeight: '95vh',
      disableClose: true,
      autoFocus: false,
      panelClass: 'audio-call-dialog'
    });
  }

  displayVideoDialog(Userto: string): void {
    if (!this.signalRService.hubConnection || 
        this.signalRService.hubConnection.state !== 'Connected') {
      this.signalRService.startConnection().then(() => {
        this.initiateVideoCall(Userto);
      }).catch(err => {
        console.error('Failed to start video connection:', err);
        this.toastrSvc.error('Failed to initialize video call');
      });
    } else {
      this.initiateVideoCall(Userto);
    }
  }

  private initiateVideoCall(Userto: string): void {
    this.signalRService.remoteUserId = Userto;
    this.signalRService.isOpen = true;
    
    this.dialog.open(VideoChatComponent,{
            width: '400px',
            height: '600px',
            disableClose:false,
            autoFocus:false,
            panelClass: 'video-call-dialog'
          });
  }
  
  userDesc(): void {
    this.profileClicked = true;
  }

  exitProfile(): void {
    this.profileClicked = false;
  }

  scrollToBottom(smooth: boolean = false): void {
    try {
      if (this.chatScrollContainer?.nativeElement) {
        this.chatScrollContainer.nativeElement.scrollTo({
          top: this.chatScrollContainer.nativeElement.scrollHeight,
          behavior: smooth ? 'smooth' : 'auto'
        });
      } else {
        const element = document.getElementById('chat-scroll');
        if (element) {
          element.scrollTo({
            top: element.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
          });
        }
      }
      this.showScrollButton = false;
      this.userScrolled = false;
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

    if(this.reactionAddedSubscription){
      this.reactionAddedSubscription.unsubscribe();
    }

    if(this.reactionRemovedSubscription){
      this.reactionRemovedSubscription.unsubscribe();
    }

    if(this.deleteMessageSubscription){
      this.deleteMessageSubscription.unsubscribe();
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