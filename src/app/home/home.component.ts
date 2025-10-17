import { Component, Inject, OnDestroy, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { firstValueFrom, forkJoin, map, Observable, Subscription } from 'rxjs';
import { FriendrequestService } from '../Services/friendrequest.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule , FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit, OnDestroy {
  public usersList: any[] = [];
  public userName: any;
  public currentUserId: any;
  public userList2: any[] = [];
  public friends: any[] = [];
  IsLoader: boolean = true;
  filter: string = '';
  
  private onlineUsersSubscription?: Subscription;
  private typingUsersSubscription?: Subscription;
  friendRequestSubscription!: Subscription;
  friendResponseSubscription!: Subscription;
  unfriendSubscription!: Subscription;

  private isBrowser: boolean;
  
  public typingUsers: {[key: string]: boolean} = {};

  constructor(
    public authSvc: AuthenticationService, 
    private router: Router, 
    private activatedRoute: ActivatedRoute, 
    private chatService: ChatService,
    private friendRequestSvc: FriendrequestService,
    private toastrSvc: ToastrService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit() {
    if (!this.isBrowser) {
      return;
    }
    this.userName = this.authSvc.getUserName();
    this.currentUserId = this.authSvc.getUserId();
    this.loadFriends();

    this.friendRequestSubscription = this.chatService.friendRequest$.subscribe(req=>{
      if(req.toUserId == this.currentUserId){
        this.toastrSvc.success("New Friend Request received");
      }
    });

    this.friendResponseSubscription = this.chatService.friendResponse$.subscribe(res=>{
      if(res){
        this.toastrSvc.success(`Friend request ${res.status}`);
      }
    });
  }

  ngOnDestroy(): void {
    if(this.friendRequestSubscription){
      this.friendRequestSubscription.unsubscribe();
    }

    if(this.friendResponseSubscription){
      this.friendResponseSubscription.unsubscribe();
    }

    if(this.onlineUsersSubscription){
      this.onlineUsersSubscription.unsubscribe();
    }
  }

  loadFriends(): void {
    this.friendRequestSvc.getFriendsList(this.currentUserId).subscribe({
      next: (data) => {
        this.friends = data;
        
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
      this.chatService.startConnection(
        this.userName,
        () => {},
        () => {}
      );

      this.onlineUsersSubscription = this.chatService.onlineUsers$.subscribe(onlineUsers => {
        if (!onlineUsers || onlineUsers.length === 0) {
          this.userList2 = [];
          return;
        }

        const friendUserNames = this.friends.map(f => f.userName.toLowerCase());
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
            unreadCount: 0,
            lastMessage: u.lastMessage || '',
            lastMessageSender: u.lastMessageSender || '',
            lastMessageTime: null as Date | null
          }));

        const observables = this.userList2.map(user =>
          this.getUnreadCountAndLastMessage(user.userName, this.authSvc.getUserName()).pipe(
            map((res: any) => {
              user.unreadCount = res?.count || 0;
              user.lastMessage = user.lastMessage || res?.lastMsg || '';
              user.lastMessageSender = user.lastMessageSender || res?.lastMsgSender || '';
              user.lastMessageTime = res?.lastMsgTime ? new Date(res.lastMsgTime) : null;
              return user;
            })
          )
        );

        forkJoin(observables).subscribe(updatedUsers => {
          // Sort by lastMessageTime descending
          this.userList2 = updatedUsers.sort((a, b) => {
            const timeA = a.lastMessageTime ? a.lastMessageTime.getTime() : 0;
            const timeB = b.lastMessageTime ? b.lastMessageTime.getTime() : 0;
            return timeB - timeA;
          });

          this.IsLoader = false;
        });
      });

      this.typingUsersSubscription = this.chatService.typingUsers$.subscribe(
        (typingUsers) => {
          this.typingUsers = typingUsers;
        }
      );

    } catch (error) {
      console.error("Error initializing SignalR:", error);
      this.IsLoader = false;
    }
  }

  getUnreadCountAndLastMessage(fromUser: string, userTo: string): Observable<any[] | null> {
    return this.chatService.unreadCount(fromUser, userTo).pipe(
      map((res: any) => {
        return res;
      })
    );
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
    this.chatService.markAsSeen(userName, this.userName);
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