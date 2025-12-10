import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GroupService, GroupDetails } from '../Services/group.service';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { Subscription } from 'rxjs';

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

  private groupMessageSub?: Subscription;
  private groupUpdatedSub?: Subscription;

  constructor(
    private groupSvc: GroupService,
    private chatSvc: ChatService,
    private authSvc: AuthenticationService,
    private router: Router
  ) {
    this.currentUserName = this.authSvc.getUserName();
  }

  ngOnInit(): void {
    this.loadGroups();
    this.setupSignalR();
  }

  ngOnDestroy(): void {
    this.groupMessageSub?.unsubscribe();
    this.groupUpdatedSub?.unsubscribe();
  }

  loadGroups(): void {
    this.groupSvc.getMyGroups().subscribe({
      next: (data) => {
        this.groups = data;
        this.filteredGroups = data;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Failed to load groups', err);
        this.isLoading = false;
      }
    });
  }

  setupSignalR(): void {
    // this.chatSvc.setupEventHandlers();

    this.groupMessageSub = this.chatSvc.groupMessages$.subscribe((message) => {
      if (message) {
        const group = this.groups.find(g => g.id === message.groupId);
        if (group) {
          group.lastMessage = {
            id: message.id,
            groupId: message.groupId,
            fromUser: message.fromUser,
            message: message.message,
            isImage: message.isImage,
            mediaUrl: message.mediaUrl,
            created: new Date(message.created),
            status: message.status
          };
          
          // Re-sort groups by last message time
          this.groups.sort((a, b) => {
            const timeA = a.lastMessage?.created?.getTime() || a.createdAt.getTime();
            const timeB = b.lastMessage?.created?.getTime() || b.createdAt.getTime();
            return timeB - timeA;
          });
          
          this.filterGroups();
        }
      }
    });

    this.groupUpdatedSub = this.chatSvc.groupUpdatedEvent$.subscribe((data) => {
      if (data) {
        const group = this.groups.find(g => g.id === data.groupId);
        if (group) {
          group.groupName = data.groupName;
          group.groupImage = data.groupImage;
        }
      }
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