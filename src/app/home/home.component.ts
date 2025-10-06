import { Component, Inject, OnInit, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { Subscription } from 'rxjs';

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
  public userList2: any[] = [];
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
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  async ngOnInit(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    this.userName = this.authSvc.getUserName();
    await this.initializeSignalR();
  }

  private async initializeSignalR(): Promise<void> {
    try {
      
      await this.chatService.startConnection(
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
              unreadCount: user.unreadCount || 0,
              lastMessage: user.lastMessage || '',
              lastMessageSender: user.lastMessageSender || ''
            }))
            .filter(u=>u.userName != this.authSvc.getUserName());
            
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