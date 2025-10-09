import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { FriendrequestService } from '../Services/friendrequest.service';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';
import { Router } from '@angular/router';

interface FriendRequest {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: string;
  fromUser?: any;
  toUser?: any;
  createdAt?: Date;
}

interface User {
  id: string;
  userName: string;
  email: string;
  profileImage?: string;
  fullName?: string;
  relationshipStatus?: string;
}

@Component({
  selector: 'app-friend-request',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friend-request.component.html',
  styleUrl: './friend-request.component.css'
})
export class FriendRequestComponent implements OnInit, OnDestroy {
  currentUserName: string = '';
  currentUserId: string = '';
  friendRequests: FriendRequest[] = [];
  friends: User[] = [];
  searchQuery: string = '';
  searchResults: User[] = [];
  isLoading: boolean = false;
  isSearching: boolean = false;
  activeTab: 'requests' | 'friends' | 'send' = 'requests';

  onlineUsersSubscription!: Subscription;

  constructor(
    private authSvc: AuthenticationService, 
    private chatSvc: ChatService,
    private friendRequestSvc: FriendrequestService,
    private toastrSvc: ToastrService,
    private route: Router
  ) {
    this.currentUserName = this.authSvc.getUserName() || '';
    this.currentUserId = this.authSvc.getUserId() || '';
  }

  ngOnInit(): void {
    this.loadFriendRequests();
    this.loadFriends();
  }

  unfriend(userId: string): void {
    this.friendRequestSvc.unfriend(this.currentUserId, userId).subscribe({
      next: () => {
        this.toastrSvc.success('Unfriended successfully'); 
        this.searchUsers();
        this.searchQuery = '';
        this.searchResults = [];
        this.loadFriendRequests();
        this.loadFriends();
      },
      error: (err) => {
        this.toastrSvc.error('Failed to unfriend');
        console.error(err);
      }
    });
  }

  setActiveTab(tab: 'requests' | 'friends' | 'send'): void {
    this.activeTab = tab;
    if (tab === 'requests') {
      this.loadFriendRequests();
      this.searchQuery = '';
      this.searchResults = [];
    } else if (tab === 'friends') {
      this.loadFriends();
      this.searchQuery = '';
      this.searchResults = [];
    }
  }

  openChat(userName: string): void {
    this.chatSvc.setCurrentChatUser(userName);
    this.chatSvc.markAsSeen(userName, this.currentUserName);
    this.route.navigate(['chats', userName]);
  }

  loadFriendRequests(): void {
    this.isLoading = true;
    this.friendRequestSvc.getPendingRequests(this.currentUserId).subscribe({
      next: (data) => {
        this.friendRequests = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.toastrSvc.error('Failed to load friend requests');
        this.isLoading = false;
        console.error(err);
      }
    });
  }

  loadFriends(): void {
    this.isLoading = true;
    this.friendRequestSvc.getFriendsList(this.currentUserId).subscribe({
      next: (data) => {
        this.friends = data;
        console.log('Friends List: ', this.friends);
        this.isLoading = false;
      },
      error: (err) => {
        this.toastrSvc.error('Failed to load friends list');
        this.isLoading = false;
        console.error(err);
      }
    });
  }

  isUserOnline(userName: string): boolean {
    const users = this.chatSvc.onlineUsers$.value;
    return users.some(u => u.userName === userName && u.isOnline);
  }

  ngOnDestroy(): void {
    this.onlineUsersSubscription?.unsubscribe();
  }

  searchUsers(): void {
    if (!this.searchQuery.trim()) {
      this.searchResults = [];
      return;
    }

    this.isSearching = true;
    this.friendRequestSvc.searchUsers(this.searchQuery, this.currentUserId).subscribe({
      next: (data: any) => {
        this.searchResults = data.filter((user: User) => user.id !== this.currentUserId);
        this.isSearching = false;
      },
      error: (err:any) => {
        this.toastrSvc.error('Failed to search users');
        this.isSearching = false;
        console.error(err);
      }
    });
  }

  sendFriendRequest(toUserId: string): void {
    const requestData = {
      fromUserId: this.currentUserId,
      toUserId: toUserId,
      status: 'Pending'
    };

    this.friendRequestSvc.sendFriendRequest(requestData).subscribe({
      next: (response: any) => {
        this.toastrSvc.success(response.message || 'Friend request sent successfully');
        this.searchUsers()
        this.searchQuery = '';
        this.searchResults = [];
        this.loadFriendRequests();
        this.loadFriends();
      },
      error: (err) => {
        this.toastrSvc.error(err.error?.message || 'Failed to send friend request');
        console.error(err);
      }
    });
  }

  respondToRequest(requestId: string, action: 'accept' | 'reject'): void {
    const responseData = {
      requestId: requestId,
      action: action
    };

    this.friendRequestSvc.getFriendRequestResponse(responseData).subscribe({
      next: () => {
        this.toastrSvc.success(`Friend request ${action}ed successfully`);
        this.loadFriendRequests();
        if (action === 'accept') {
          this.loadFriends();
          this.loadFriendRequests();
        }
      },
      error: (err) => {
        this.toastrSvc.error(`Failed to ${action} friend request`);
        console.error(err);
      }
    });
  }

  acceptRequest(requestId: string): void {
    this.respondToRequest(requestId, 'accept');
  }

  rejectRequest(requestId: string): void {
    this.respondToRequest(requestId, 'reject');
  }
}