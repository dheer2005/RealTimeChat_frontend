import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { Subscription } from 'rxjs';
import { FriendrequestService } from '../Services/friendrequest.service';
import { VideoService } from '../Services/video.service';
import { AudioService } from '../Services/audio.service';
import { AudioChatComponent } from '../audio-chat/audio-chat.component';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from '../video-chat/video-chat.component';
import { AlertService } from '../Services/alert.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule , FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  public usersList: any[] = [];
  public currentUserName: any;
  public currentUserId: any;
  public userList2: any[] = [];
  public friends: any[] = [];
  IsLoader: boolean = true;
  filter: string = '';
  
  private onlineUsersSubscription?: Subscription;
  private typingUsersSubscription?: Subscription;
  private friendRequestSubscription!: Subscription;
  private friendResponseSubscription!: Subscription;
  private unfriendSubscription!: Subscription;
  private messageDeleteSubscription!: Subscription;
  
  public typingUsers: {[key: string]: boolean} = {};

  constructor(
    public authSvc: AuthenticationService, 
    private router: Router, 
    private activatedRoute: ActivatedRoute, 
    private chatService: ChatService,
    private videoService: VideoService,
    private audioService: AudioService,
    private dialog: MatDialog,
    private friendRequestSvc: FriendrequestService,
    private toastrSvc: AlertService
  ) {
  }

  ngOnInit() {
    this.currentUserName = this.authSvc.getUserName();
    this.currentUserId = this.authSvc.getUserId();

    const cachedFriends = this.chatService.getHomeFriends();
    const cachedUserList = this.chatService.getHomeUserList();

    if (cachedFriends && cachedUserList) {
      this.friends = cachedFriends;
      this.userList2 = cachedUserList;
      this.IsLoader = false;
      this.initializeSignalR();
    }else{
      this.loadFriends();
    }


    this.audioService.incomingAudioCall.subscribe((fromUser: string) => {
      
      this.audioService.remoteUserId = fromUser;
      this.audioService.incomingCall = true;
      
      if(!this.audioService.isOpen){
        this.audioService.isOpen = true;
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
    });

    this.videoService.offerReceived.subscribe(async(data)=>{
      if(data){
        if(!this.videoService.isOpen){
          this.videoService.isOpen = true;
          this.dialog.open(VideoChatComponent,{
            width: '400px',
            height: '600px',
            disableClose:false,
            autoFocus:false,
            panelClass: 'video-call-dialog'
          });
        }
        this.videoService.remoteUserId = data.from;
        this.videoService.incomingCall = true;
      }
    })

    this.friendRequestSubscription = this.chatService.friendRequest$.subscribe(req=>{
      if(req && req.toUserId == this.currentUserId){
        // this.toastrSvc.success("New Friend Request received");
      }
    });

    this.friendResponseSubscription = this.chatService.friendResponse$.subscribe(res => {
      if (res && res.status) {
        const status = res.status.toLowerCase();
        if (status === 'accepted') {
          this.toastrSvc.success('Friend request accepted');
          this.addFriendOptimistically(res);
        } else if (status === 'rejected') {
          this.toastrSvc.info('Friend request rejected');
        }
      }
    });

    this.unfriendSubscription = this.chatService.unfriend$.subscribe(ev => {
      
      if (ev && !ev.forCancel && (ev.fromUser === this.currentUserId || ev.toUser === this.currentUserId)) {
        this.toastrSvc.info('Friend removed');
        
        const removedUserId = ev.fromUser === this.currentUserId ? ev.toUser : ev.fromUser;
        this.removeFriendOptimistically(removedUserId);
      }
    });

    this.messageDeleteSubscription = this.chatService.messageDelete$.subscribe(messageId => {

      let changed = false;

      this.userList2.forEach(user => {

        if (user.lastMessage && user.lastMessageId === messageId) {
          user.lastMessage = '';
          user.lastMessageSender = '';
          user.lastMessageTime = null;
          user.unreadCount = 0;
          changed = true;
          return;
        }

        if (
          user.unreadCount > 0 &&
          user.lastMessageSender !== this.currentUserName
        ) {
          user.unreadCount = Math.max(0, user.unreadCount - 1);
          changed = true;
        }
      });

      if (changed) {
        this.userList2 = [...this.userList2];
        this.chatService.setHomeUserList(this.userList2);
      }

      this.syncUnreadSummary();
    });
  }

  private syncUnreadSummary(): void {
    this.chatService.getUnreadSummary(this.currentUserName).subscribe(summary => {

      const summaryMap = new Map(
        summary.map((s: any) => [s.userName, s])
      );

      this.userList2.forEach(user => {
        const item = summaryMap.get(user.userName);

        if (!item) {
          user.unreadCount = 0;
          user.lastMessage = '';
          user.lastMessageSender = '';
          user.lastMessageTime = null;
          user.lastMessageId = null;
          return;
        }

        user.unreadCount = item.unreadCount;
        user.lastMessage = item.lastMessage;
        user.lastMessageSender = item.lastMessageSender;
        user.lastMessageTime = item.lastMessageTime
          ? new Date(item.lastMessageTime)
          : null;
        user.lastMessageId = item.lastMessageId;
      });

      this.userList2 = [...this.userList2].sort(
        (a, b) => (b.lastMessageTime?.getTime() || 0) - (a.lastMessageTime?.getTime() || 0)
      );

      this.chatService.setHomeUserList(this.userList2);
    });
  }

  private addFriendOptimistically(response: any): void {
    const isCurrentUserSender = response.fromUserId === this.currentUserId;
    const newFriend = isCurrentUserSender ? response.toUser : response.fromUser;
    
    if (!newFriend) return;
    
    const exists = this.friends.some(f => f.id === newFriend.id);
    if (!exists) {
      this.friends.push(newFriend);
    }
    
    this.addToUserList2IfOnline(newFriend);
  }

  private removeFriendOptimistically(userId: string): void {
    
    const friend = this.friends.find(f => f.id === userId);
    
    this.friends = this.friends.filter(f => f.id !== userId);
    
    if (friend) {
      this.userList2 = this.userList2.filter(u => 
        u.userName.toLowerCase() !== friend.userName.toLowerCase()
      );
    }

    this.chatService.setHomeFriends(this.friends);
    this.chatService.setHomeUserList(this.userList2);
  }

  private addToUserList2IfOnline(friend: any): void {
    const onlineUsers = this.chatService.onlineUsers$.value;
    const onlineUser = onlineUsers.find(u => 
      u.userName.toLowerCase() === friend.userName.toLowerCase()
    );
    
    if (onlineUser && onlineUser.isOnline) {
      const exists = this.userList2.some(u => 
        u.userName.toLowerCase() === friend.userName.toLowerCase()
      );
      
      if (!exists) {
        const newUserEntry = {
          userName: friend.userName,
          fullName: friend.fullName || '',
          phoneNumber: friend.phoneNumber || '',
          email: friend.email || '',
          isOnline: true,
          profileImage: friend.profileImage || '',
          unreadCount: 0,
          lastMessage: '',
          lastMessageSender: '',
          lastMessageTime: null as Date | null
        };
        
        this.userList2.push(newUserEntry);
        
        this.userList2 = this.userList2.sort(
          (a, b) => (b.lastMessageTime?.getTime() || 0) - (a.lastMessageTime?.getTime() || 0)
        );

        this.chatService.setHomeFriends(this.friends);
        this.chatService.setHomeUserList(this.userList2);
      }
    }
  }

  ngOnDestroy(): void {
    if(this.friendRequestSubscription){
      this.friendRequestSubscription.unsubscribe();
    }

    if(this.friendResponseSubscription){
      this.friendResponseSubscription.unsubscribe();
    }

    if(this.unfriendSubscription){
      this.unfriendSubscription.unsubscribe();
    }

    if(this.onlineUsersSubscription){
      this.onlineUsersSubscription.unsubscribe();
    }

    if(this.typingUsersSubscription){
      this.typingUsersSubscription.unsubscribe();
    }

    if(this.messageDeleteSubscription){
      this.messageDeleteSubscription.unsubscribe();
    }
  }

  loadFriends(): void {
    this.friendRequestSvc.getFriendsList(this.currentUserId).subscribe({
      next: (data) => {
        this.friends = data;
        if(this.friends.length == 0){
          this.IsLoader = false;
        }
        this.chatService.setHomeFriends(data);
        
        this.initializeSignalR();
      },
      error: (err) => {
        this.toastrSvc.error('Failed to load friends list');
        console.error(err);
      }
    });
  }

  private initializeSignalR(): void {
    try {
      this.videoService.startConnection().catch((err:any) => console.log(err));
      this.audioService.startConnection().catch((err:any) => console.log(err));
      this.chatService.startConnection(
        this.currentUserName,
        () => {},
        () => {}
      );

      this.onlineUsersSubscription = this.chatService.onlineUsers$.subscribe(onlineUsers => {
        if (!onlineUsers || onlineUsers.length === 0) {
          return;
        }

        const friendUserNames = this.friends.map(f => f.userName.toLowerCase());

        if (this.IsLoader) {
          this.userList2 = onlineUsers
          .filter(u => u.userName.toLowerCase() !== this.authSvc.getUserName().toLowerCase())
          .filter(u => friendUserNames.includes(u.userName.toLowerCase()))
          .map(u => ({
            userName: u.userName,
            fullName: u.fullName || '',
            phoneNumber: u.phoneNumber || '',
            email: u.email || '',
            isOnline: u.isOnline || false,
            profileImage: u.profileImage || '',
            unreadCount: 0, // Initialize to 0, will be updated by unread summary
            lastMessage: '',
            lastMessageSender: '',
            lastMessageTime: null as Date | null
          }));

          this.chatService.getUnreadSummary(this.currentUserName).subscribe(summary => {
            summary.forEach((item:any) => {
              const user = this.userList2.find(u => u.userName === item.userName);
              if (user) {
                user.unreadCount = item.unreadCount;
                user.lastMessage = item.lastMessage;
                user.lastMessageTime = new Date(item.lastMessageTime);
                user.lastMessageSender = item.lastMessageSender;
              }
            });

            this.userList2 = this.userList2.sort(
              (a, b) => (b.lastMessageTime?.getTime() || 0) - (a.lastMessageTime?.getTime() || 0)
            );

            this.chatService.setHomeUserList(this.userList2);

            this.IsLoader = false;
          });
        } else {
          let changed = false;

          onlineUsers.forEach(onlineUser => {
            if (!friendUserNames.includes(onlineUser.userName.toLowerCase())) return;

            const existingUser = this.userList2.find(
              u => u.userName.toLowerCase() === onlineUser.userName.toLowerCase()
            );

            if (existingUser) {
              if (existingUser.isOnline !== onlineUser.isOnline) {
                existingUser.isOnline = onlineUser.isOnline;
                changed = true;
              }

              if (onlineUser.lastMessage && existingUser.lastMessage !== onlineUser.lastMessage) {
                existingUser.unreadCount = existingUser.unreadCount || 0;
                if (onlineUser.lastMessageSender !== this.currentUserName) {
                  existingUser.unreadCount += 1;
                }
                existingUser.lastMessage = onlineUser.lastMessage;
                existingUser.lastMessageSender = onlineUser.lastMessageSender;
                existingUser.lastMessageTime = onlineUser.lastMessageTime
                  ? new Date(onlineUser.lastMessageTime)
                  : null;
                changed = true;
              }
            }
          });

          if (changed) {
            this.userList2 = [...this.userList2].sort(
              (a, b) => (b.lastMessageTime?.getTime() || 0) - (a.lastMessageTime?.getTime() || 0)
            );

            this.chatService.setHomeUserList(this.userList2);
          }
        }
      }
    );

    this.typingUsersSubscription = this.chatService.typingUsers$.subscribe(
      (typingUsers) => {
        this.typingUsers = typingUsers;
      }
    );

    this.chatService.conversationSeen$.subscribe(userName => {

      const list = this.chatService.getHomeUserList() || [];

      const user = list.find(u => u.userName === userName);
      if (!user) return;

      user.unreadCount = 0;
      user.lastMessageSender = user.lastMessageSender;
      user.lastMessage = user.lastMessage || '';

      this.chatService.setHomeUserList([...list]);
      this.userList2 = [...list];
    });

    } catch (error) {
      console.error("Error initializing SignalR:", error);
      this.IsLoader = false;
    }
  }

  onKeyPress(event: any): void {
    this.filter = event.target.value;
  }
 
  filteredList(): any[] {
    const list = this.filter === ''
      ? this.userList2 
      : this.userList2.filter((users: any) => 
          users?.userName?.toLowerCase().includes(this.filter.toLowerCase())
        );
    return list;
  }

  userCard(userName: string): void {
    this.chatService.setCurrentChatUser(userName);
    this.chatService.markAsSeen(userName, this.currentUserName);
    this.router.navigate(['chats', userName]);
  }

  isUserOnline(userName: string): boolean {
    const user = this.userList2.find(u => u.userName === userName);
    return user?.isOnline || false;
  }

  isUserTyping(userName: string): boolean {
    return this.typingUsers[userName] === true;
  }

  getTypingStatus(userName: string): string {
    return this.isUserTyping(userName) ? 'typing...' : '';
  }

  getOnlineStatusClass(userName: string): string {
    return this.isUserOnline(userName) ? 'status-online' : 'status-offline';
  }

}