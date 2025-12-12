import { Component, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { GroupService } from '../Services/group.service';
import { FriendrequestService } from '../Services/friendrequest.service';
import { AuthenticationService } from '../Services/authentication.service';
import { AlertService } from '../Services/alert.service';
import { ChatService } from '../Services/chat.service';

interface Friend {
  id: string;
  userName: string;
  fullName: string;
  profileImage?: string;
  selected: boolean;
}

@Component({
  selector: 'app-create-group',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-group.component.html',
  styleUrl: './create-group.component.css'
})
export class CreateGroupComponent implements OnInit {
  groupName: string = '';
  groupImage: string = '';
  friends: Friend[] = [];
  searchQuery: string = '';
  isCreating: boolean = false;
  currentUserId: string = '';

  constructor(
    private groupSvc: GroupService,
    private friendSvc: FriendrequestService,
    private authSvc: AuthenticationService,
    private router: Router,
    private chatSvc: ChatService,
    private location: Location,
    private alertSvc: AlertService
  ) {
    this.currentUserId = this.authSvc.getUserId();
  }

  ngOnInit(): void {
    this.loadFriends();
  }

  loadFriends(): void {
    this.friendSvc.getFriendsList(this.currentUserId).subscribe({
      next: (data) => {
        this.friends = data.map((friend: any) => ({
          id: friend.id,
          userName: friend.userName,
          fullName: friend.fullName || friend.userName,
          profileImage: friend.profileImage,
          selected: false
        }));
      },
      error: (err) => {
        this.alertSvc.error('Failed to load friends');
        console.error(err);
      }
    });
  }

  toggleSelection(friend: Friend): void {
    friend.selected = !friend.selected;
  }

  getSelectedCount(): number {
    return this.friends.filter(f => f.selected).length;
  }

  getFilteredFriends(): Friend[] {
    if (!this.searchQuery.trim()) {
      return this.friends;
    }
    const query = this.searchQuery.toLowerCase();
    return this.friends.filter(f =>
      f.userName.toLowerCase().includes(query) ||
      f.fullName.toLowerCase().includes(query)
    );
  }

  canCreateGroup(): boolean {
    return this.groupName.trim().length > 0 && this.getSelectedCount() > 0;
  }

  createGroup(): void {
    if (!this.canCreateGroup()) {
      this.alertSvc.warning('Please enter a group name and select at least one member');
      return;
    }

    this.isCreating = true;
    const selectedUserIds = this.friends
      .filter(f => f.selected)
      .map(f => f.id);

    const allMemberIds = [...selectedUserIds,this.currentUserId];

    this.groupSvc.createGroup({
      groupName: this.groupName,
      groupImage: this.groupImage || undefined,
      memberUserIds: selectedUserIds
    }).subscribe({
      next: (response) => {
        this.chatSvc.notifyGroupCreated(response, selectedUserIds);
        this.alertSvc.success('Group created successfully!');
        this.router.navigate(['/groups-list']);
      },
      error: (err) => {
        this.alertSvc.error('Failed to create group');
        console.error(err);
        this.isCreating = false;
      }
    });
  }

  goBack(): void {
    this.location.back();
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }
}