import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { firstValueFrom, map, Observable, Subscription } from 'rxjs';
import { FriendrequestService } from '../Services/friendrequest.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule , FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  public usersList: any[] = [];
  public userName: any;
  public currentUserId: any;
  public userList2: any[] = [];
  public friends: any[] = [];
  IsLoader: boolean = true;
  filter: string = '';
  
  private onlineUsersSubscription?: Subscription;
  private typingUsersSubscription?: Subscription;

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

      this.onlineUsersSubscription = this.chatService.onlineUsers$.subscribe(
        (onlineUsers) => {
          if (onlineUsers.length > 0) {
            this.userList2 = onlineUsers.map(user => ({
              userName: user.userName,
              fullName: user.fullName || '',
              phoneNumber: user.phoneNumber || '',
              email: user.email || '',
              isOnline: user.isOnline || false,
              profileImage: user.profileImage || '',
              unreadCount: 0,
              lastMessage: user.lastMessage || '',
              lastMessageSender: user.lastMessageSender || ''
            }))
            .filter(u=>u.userName != this.authSvc.getUserName());

            const friendUserNames = this.friends.map(f => f.userName.toLowerCase());
            this.userList2 = this.userList2.filter(u => friendUserNames.includes(u.userName.toLowerCase()));

             this.userList2.forEach(user => {
              this.getUnreadCountAndLastMessage(user.userName, this.authSvc.getUserName()).subscribe((res:any) => {
                user.unreadCount += res?.count || 0;
                user.lastMessage = user.lastMessage ? user.lastMessage : res?.lastMsg || '';
                user.lastMessageSender = user.lastMessageSender ? user.lastMessageSender : res?.lastMsgSender || '';
              });
            })
            
            this.IsLoader = false;
          }
        }
      );

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