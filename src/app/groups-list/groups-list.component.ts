import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GroupService, GroupDetails } from '../Services/group.service';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { Subscription } from 'rxjs';
import { log } from 'console';

@Component({
  selector: 'app-groups-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './groups-list.component.html',
  styleUrl: './groups-list.component.css'
})
export class GroupsListComponent implements OnInit, OnDestroy {
  groups: GroupDetails[] = [];
  filteredGroups: GroupDetails[] = [];
  searchQuery: string = '';
  isLoading: boolean = true;
  showCreateModal: boolean = false;
  currentUserName: string = '';
  typingUsers: string[] = [];
  displayTypingText: string = '';

  private groupMessageSub?: Subscription;
  private groupUpdatedSub?: Subscription;
  private typingSub?: Subscription;
  private memberAddedEventSub?: Subscription;
  private memberRemovedEventSub?: Subscription;
  private groupCreatedEventSub?: Subscription;


  constructor(
    private groupSvc: GroupService,
    private chatSvc: ChatService,
    private authSvc: AuthenticationService,
    private router: Router
  ) {
    this.currentUserName = this.authSvc.getUserName();
  }

  async ngOnInit(): Promise<void> {
     await this.chatSvc.startConnection(
      this.currentUserName,
      () => console.log('✅ Groups SignalR Connected'),
      () => console.log('❌ Groups SignalR Disconnected')
    );
    await this.loadGroups();
    await this.setupSignalR();
  }

  ngOnDestroy(): void {
    this.groupMessageSub?.unsubscribe();
    this.groupUpdatedSub?.unsubscribe();
    this.typingSub?.unsubscribe();
    this.memberAddedEventSub?.unsubscribe();
    this.memberRemovedEventSub?.unsubscribe();
    this.groupCreatedEventSub?.unsubscribe();
  }

  async loadGroups(): Promise<void> {
    this.groupSvc.getMyGroups().subscribe({
      next: async (data) => {
        this.groups = data;
        this.filteredGroups = data;
        this.isLoading = false;

        for (const g of this.groups) {
          await this.chatSvc.joinGroupRoom(g.id);
        }

      },
      error: (err) => {
        console.error('Failed to load groups', err);
        this.isLoading = false;
      }
    });
  }

  setupSignalR(): void {
    this.groupMessageSub = this.chatSvc.groupMessages$.subscribe((message) => {
      if (!message) return;

      const group = this.groups.find(g => g.id === message.groupId);
      if (!group) return;

      group.lastMessage = {
        ...message,
        created: new Date(message.created)
      };

      group.typingUsers = [];

      const currentUrl = this.router.url;
      const isCurrentlyViewing = currentUrl.includes(`/group-chat/${group.id}`);
      
      if (!isCurrentlyViewing && message.fromUser !== this.currentUserName) {
        group.unreadCount = (group.unreadCount || 0) + 1;
      }

      this.groups.sort((a, b) => {
        const timeA = a.lastMessage?.created?.getTime() || a.createdAt.getTime();
        const timeB = b.lastMessage?.created?.getTime() || b.createdAt.getTime();
        return timeB - timeA;
      });

      this.filterGroups();
    });

    this.groupUpdatedSub = this.chatSvc.groupUpdatedEvent$.subscribe((data) => {
      if (!data) return;
      
      const group = this.groups.find(g => g.id === data.groupId);
      if (group) {
        group.groupName = data.groupName;
        if (data.groupImage !== undefined) {
          group.groupImage = data.groupImage;
        }
        this.filterGroups();
      }
    });

    this.typingSub = this.chatSvc.groupTypingUsers$.subscribe(data => {
      this.groups.forEach(group => {
        const usersTyping = data[group.id] || [];

        const othersTyping = usersTyping.filter(u => u !== this.currentUserName);

        group.typingUsers = othersTyping;

        if (othersTyping.length === 1) {
          group.typingText = `${othersTyping[0]} is typing...`;
        }
        else if (othersTyping.length === 2) {
          group.typingText = `${othersTyping[0]} and ${othersTyping[1]} are typing...`;
        }
        else if (othersTyping.length > 2) {
          group.typingText = `${othersTyping[0]}, ${othersTyping[1]} and ${othersTyping.length - 2} others are typing...`;
        }
        else {
          group.typingText = '';
        }
      });
      this.filterGroups();
    });

    this.memberAddedEventSub = this.chatSvc.memberAddedEvent$.subscribe((event) => {
      if (!event) return;

      let group = this.groups.find(g => g.id === event.groupId);

      if (!group) {

        this.groupSvc.getGroupDetails(event.groupId).subscribe({
          next: (data) => {
            this.groups = [data, ...this.groups];
            this.filteredGroups = [...this.groups];

            this.chatSvc.joinGroupRoom(event.groupId);
          },
          error: (err) => console.error("Failed to load new group:", err)
        });

        return;
      }
      if (event.member) {
        const exists = group.members.some(m => m.userId === event.member.userId);

        if (!exists) {
          group.members = [...group.members, event.member];
          this.groups = [...this.groups];
          this.filterGroups();
        }
      }
    });

    this.memberRemovedEventSub = this.chatSvc.memberRemovedEvent$.subscribe((event) => {
      if (!event) return;
      
      const group = this.groups.find(g => g.id === event.groupId);
      if (group) {
        group.members = group.members.filter(m => m.userId !== event.userId);
        
        if (event.userId === this.authSvc.getUserId()) {
          this.groups = this.groups.filter(g => g.id !== event.groupId);
          this.filterGroups();
        }
      }
    });

    this.groupCreatedEventSub = this.chatSvc.groupCreatedEvent$.subscribe((group) => {
      if (!group?.groupId) return;

      this.groupSvc.getGroupDetails(group.groupId).subscribe({
        next: (fullGroup) => {
          this.groups = [fullGroup, ...this.groups];
          this.filteredGroups = [...this.groups];
          this.chatSvc.joinGroupRoom(fullGroup.id);
        },
        error: (err) => console.error("Failed to load new group:", err)
      });
    });
  }

  onSearch(): void {
    this.filterGroups();
  }

  filterGroups(): void {
    if (!this.searchQuery.trim()) {
      this.filteredGroups = [...this.groups];
    } else {
      const query = this.searchQuery.toLowerCase();
      this.filteredGroups = this.groups.filter(group =>
        group.groupName.toLowerCase().includes(query)
      );
    }
  }

  openGroup(groupId: number): void {
    const group = this.groups.find(g => g.id === groupId);
    if (group) {
      group.unreadCount = 0;
    }
    this.groupSvc.setCurrentGroup(groupId);
    this.router.navigate(['/group-chat', groupId]);
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.router.navigate(['/create-group']);
  }

  getMemberCount(group: GroupDetails): number {
    return group.members?.length || 0;
  }

  getLastMessagePreview(group: GroupDetails): string {
    if (!group.lastMessage) return 'No messages yet';
    
    if (group.lastMessage.isImage) {
      return '📷 Photo';
    }
    
    return group.lastMessage.message.length > 50
      ? group.lastMessage.message.substring(0, 50) + '...'
      : group.lastMessage.message;
  }

  getLastMessageSender(group: GroupDetails): string {
    if (!group.lastMessage) return '';
    
    return group.lastMessage.fromUser === this.currentUserName
      ? 'You: '
      : `${group.lastMessage.fromUser}: `;
  }

  getGroupInitial(groupName: string): string {
    return groupName.charAt(0).toUpperCase();
  }
}