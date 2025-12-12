import { Component, OnInit, OnDestroy } from '@angular/core';
import { ChatService } from '../Services/chat.service';
import { GroupService, GroupMessage } from '../Services/group.service';
import { AuthenticationService } from '../Services/authentication.service';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-group-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-chat.component.html',
  styleUrl: './group-chat.component.css'
})
export class GroupChatComponent implements OnInit, OnDestroy {
  messages: GroupMessage[] = [];
  message: string = '';
  fromUser: string = '';
  groupId: number = 0;
  groupName: string = '';
  groupImage?: string;
  memberCount: number = 0;
  isLoader: boolean = true;
  showScrollButton: boolean = false;
  private userScrolled: boolean = false;
  private typingTimeout: any;
  typingUsers: string[] = [];
  displayTypingText: string = '';
  
  private groupMessageSub?: Subscription;
  private groupDeletedSub?: Subscription;
  private routeSub?: Subscription;

  constructor(
    private chatSvc: ChatService,
    private groupSvc: GroupService,
    private authSvc: AuthenticationService,
    private location: Location,
    private route: ActivatedRoute,
    private router: Router
  ) {
    this.fromUser = this.authSvc.getUserName();
  }

  groupChatBack(): void {
    this.location.back();
  }

  private setupScrollListener(): void {
    const scrollContainer = document.getElementById('group-chat-scroll');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', (event: Event) => {
        const element = event.target as HTMLElement;
        const threshold = 150;
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
        
        this.showScrollButton = !atBottom;
        this.userScrolled = !atBottom;
      });
    }
  }

  async ngOnInit(): Promise<void> {

    this.routeSub = this.route.params.subscribe(async params => {
      this.groupId = +params['groupId'];

      if (this.groupId) {

        await this.chatSvc.startConnection(
          this.fromUser,
          () => {},
          () => {}
        );

        await this.chatSvc.joinGroupRoom(this.groupId);

        this.loadGroupDetails();
        this.loadMessages();
        this.setupSignalR();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.groupId) {
      this.chatSvc.leaveGroupRoom(this.groupId);
    }
    this.groupMessageSub?.unsubscribe();
    this.groupDeletedSub?.unsubscribe();
    this.routeSub?.unsubscribe();
  }

  loadGroupDetails(): void {
    this.groupSvc.getGroupDetails(this.groupId).subscribe({
      next: (data) => {
        this.groupName = data.groupName;
        this.groupImage = data.groupImage;
        this.memberCount = data.members.length;
      },
      error: (err) => {
        console.error('Failed to load group details', err);
      }
    });
  }

  loadMessages(): void {
    this.groupSvc.getGroupMessages(this.groupId).subscribe({
      next: (data) => {
        this.messages = data;
        this.isLoader = false;
        setTimeout(() => {
          this.scrollToBottom();
          this.setupScrollListener();
        }, 100);
      },
      error: (err) => {
        console.error('Failed to load messages', err);
        this.isLoader = false;
      }
    });
  }

  setupSignalR(): void {

    this.chatSvc.groupTypingUsers$.subscribe(data => {
      const usersTyping = data[this.groupId] || [];

      const othersTyping = usersTyping.filter(u => u !== this.fromUser);

      this.typingUsers = othersTyping;

      if (othersTyping.length === 1) {
        this.displayTypingText = `${othersTyping[0]} is typing...`;
      } 
      else if (othersTyping.length === 2) {
        this.displayTypingText = `${othersTyping[0]} and ${othersTyping[1]} are typing...`;
      } 
      else if (othersTyping.length > 2) {
        this.displayTypingText = `${othersTyping[0]}, ${othersTyping[1]} and ${othersTyping.length - 2} others are typing...`;
      } 
      else {
        this.displayTypingText = '';
      }
    });

    this.groupMessageSub = this.chatSvc.groupMessages$.subscribe((message) => {
      if (message && message.groupId === this.groupId) {
        this.messages.push(message);
        if (!this.userScrolled) {
          setTimeout(() => this.scrollToBottom(), 100);
        }
      }
    });

    this.groupDeletedSub = this.chatSvc.groupMessageDeleted$.subscribe((messageId) => {
      if (messageId) {
        this.messages = this.messages.filter(m => m.id !== messageId);
      }
    });
  }

  send(): void {
    if (this.message.trim()) {
      const created = new Date();
      this.chatSvc.sendGroupMessage(
        this.groupId,
        this.fromUser,
        this.message,
        created,
        false,
        ''
      );
      this.message = '';
      this.chatSvc.notifyGroupStopTyping(this.groupId);
      setTimeout(() => this.scrollToBottom(true), 100);
    }
  }

  onTyping(): void {
    this.chatSvc.notifyGroupTyping(this.groupId);
    
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.chatSvc.notifyGroupStopTyping(this.groupId);
    }, 2000);
  }

  isNewDate(i: number): boolean {
    if (i === 0) return true;

    const current = new Date(this.messages[i].created);
    const previous = new Date(this.messages[i - 1].created);

    return (
      current.getFullYear() !== previous.getFullYear() ||
      current.getMonth() !== previous.getMonth() ||
      current.getDate() !== previous.getDate()
    );
  }

  getDateLabel(date: any): string {
    const d = new Date(date);
    const today = new Date();

    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) {
      return 'Today';
    }

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return 'Yesterday';
    }

    return d.toDateString();
  }

  scrollToBottom(smooth: boolean = false): void {
    const element = document.getElementById('group-chat-scroll');
    if (element) {
      if (smooth) {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        element.scrollTop = element.scrollHeight;
      }
      
      this.showScrollButton = false;
      this.userScrolled = false;
    }
  }

  openGroupInfo(): void {
    this.router.navigate(['/group-info', this.groupId]);
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}