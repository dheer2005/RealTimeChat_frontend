import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';
import { FriendrequestService } from '../Services/friendrequest.service';
import { catchError, debounceTime, distinctUntilChanged, of, Subject, Subscription, switchMap, tap } from 'rxjs';
import { Router } from '@angular/router';
import { query } from 'express';
import { AlertService } from '../Services/alert.service';
import Swal from 'sweetalert2';

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
  private searchSubject = new Subject<string>();
  sentFriendRequests: any[] = [];
  isLoading: boolean = false;
  isSearching: boolean = false;
  activeTab: 'requests' | 'sentRequests' | 'friends' | 'send' = 'requests';

  onlineUsersSubscription!: Subscription;
  friendRequestSubscription!: Subscription;
  friendResponseSubscription!: Subscription;
  unfriendSubscription!: Subscription;


  constructor(
    private authSvc: AuthenticationService, 
    private chatSvc: ChatService,
    private friendRequestSvc: FriendrequestService,
    private toastrSvc: AlertService,
    private route: Router
  ) {
    this.currentUserName = this.authSvc.getUserName() || '';
    this.currentUserId = this.authSvc.getUserId() || '';
  }

  ngOnInit(): void {

    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      tap({
        next: () => (this.isSearching = true)
      }),
      switchMap((query) => {
        if(!query.trim()){
          this.isSearching = false;
          this.searchResults = [];
          return of([]);
        }

        return this.friendRequestSvc.searchUsers(query, this.currentUserId).pipe(
          catchError(err =>{
            console.error(err);
            this.isSearching = false;
            this.toastrSvc.error('Failed to search users');
            return of([]);
          })
        );
      })
    ).subscribe((res:any)=>{
      this.searchResults = res.filter((u: User) => u.id !== this.currentUserId);
      this.isSearching = false;
    })

    
    this.chatSvc.startConnection(this.currentUserName, ()=> {}, ()=> {});
    
    this.loadFriendRequests();
    this.loadFriends();
    this.loadSentRequests();

    this.friendRequestSubscription = this.chatSvc.friendRequest$.subscribe(req=>{
      if(req.toUserId == this.currentUserId){
        this.loadFriendRequests();
      }
    });

    this.friendResponseSubscription = this.chatSvc.friendResponse$.subscribe(res=>{
      if(res){
        this.toastrSvc.success(`Friend request ${res.status}`);
        this.searchUsers();
        this.loadFriends();
        this.loadSentRequests();
        this.loadFriendRequests();
      }
    });

    this.unfriendSubscription = this.chatSvc.unfriend$.subscribe(ev=>{
      if(ev && (ev.user1 == this.currentUserId || ev.user2 == this.currentUserId)){
        this.searchUsers();
        this.loadFriends();
      }
    });
  }

  unfriend(userId: string): void {
    this.toastrSvc.confirm(
      'Remove Friend?',
      'Are you sure you want to remove this friend? This action cannot be undone.',
      'Yes, remove',
      'Cancel'
    ).then((result) => {
      if (result.isConfirmed) {
        Swal.fire({
        title: 'Removing Friend...',
        text: 'Please wait',
        icon: 'info',
        background: '#ffffff',
        color: '#1f2937',
        iconColor: '#667eea',
        showConfirmButton: false,
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
        customClass: {
          popup: 'purple-gradient-popup',
          title: 'purple-gradient-title'
        }
      });
        this.friendRequestSvc.unfriend(this.currentUserId, userId).subscribe({
          next: () => {
            Swal.fire({
              title: 'Friend Removed!',
              text: 'You have successfully removed this friend',
              icon: 'success',
              background: '#ffffff',
              color: '#1f2937',
              iconColor: '#10b981',
              showConfirmButton: false,
              timer: 2000,
              timerProgressBar: true,
              customClass: {
                popup: 'purple-gradient-popup',
                timerProgressBar: 'purple-gradient-timer',
                title: 'purple-gradient-title'
              }
            });
            this.searchUsers();
            this.searchQuery = '';
            this.searchResults = [];
            this.loadFriendRequests();
            this.loadFriends();
            this.loadSentRequests();
          },
          error: (err) => {
            Swal.fire({
              title: 'Failed!',
              text: 'Failed to remove friend. Please try again.',
              icon: 'error',
              background: '#ffffff',
              color: '#1f2937',
              iconColor: '#ef4444',
              confirmButtonText: 'OK',
              customClass: {
                popup: 'purple-gradient-popup',
                confirmButton: 'purple-gradient-confirm-btn',
                title: 'purple-gradient-title'
              }
            });
            console.error(err);
          }
        });
      }
    });
  }

  cancelRequest(userId: string): void {
    this.toastrSvc.confirm(
      'Withdraw?',
      'Are you sure you want to withdraw this request? This action cannot be undone.',
      'Yes, withdraw',
      'Cancel'
    ).then((result) => {
      if (result.isConfirmed) {
        this.friendRequestSvc.unfriend(this.currentUserId, userId).subscribe({
          next: () => {
            Swal.fire({
              title: 'Request Withdrawn!',
              text: 'You have successfully withdrawn your friend request',
              icon: 'success',
              background: '#ffffff',
              color: '#1f2937',
              iconColor: '#10b981',
              showConfirmButton: false,
              timer: 1500,
              timerProgressBar: true,
              customClass: {
                popup: 'purple-gradient-popup',
                timerProgressBar: 'purple-gradient-timer',
                title: 'purple-gradient-title'
              }
            });
            this.searchUsers();
            this.searchQuery = '';
            this.searchResults = [];
            this.loadFriendRequests();
            this.loadFriends();
            this.loadSentRequests();
          },
          error: (err) => {
            Swal.fire({
              title: 'Failed!',
              text: 'Failed to withdraw request. Please try again.',
              icon: 'error',
              background: '#ffffff',
              color: '#1f2937',
              iconColor: '#ef4444',
              confirmButtonText: 'OK',
              customClass: {
                popup: 'purple-gradient-popup',
                confirmButton: 'purple-gradient-confirm-btn',
                title: 'purple-gradient-title'
              }
            });
            console.error(err);
          }
        });
      }
    });
  }

  setActiveTab(tab: 'requests' | 'sentRequests' | 'friends' | 'send'): void {
    this.activeTab = tab;
    if (tab === 'requests') {
      this.loadFriendRequests();
      this.searchQuery = '';
      this.searchResults = [];
    } else if (tab === 'friends') {
      this.loadFriends();
      this.searchQuery = '';
      this.searchResults = [];
    } else if (tab === 'sentRequests') {
      this.loadSentRequests();
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

  loadSentRequests(): void{
    this.isLoading = true;
    this.friendRequestSvc.getSentRequests(this.currentUserId).subscribe({
      next: (data) => {
        this.sentFriendRequests = data;
        this.isLoading = false;
      },
      error: (err) => {
        this.toastrSvc.error('Failed to load sent requests');
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
    if(this.onlineUsersSubscription){
      this.onlineUsersSubscription?.unsubscribe();
    }

    if(this.friendRequestSubscription){
      this.friendRequestSubscription.unsubscribe();
    }

    if(this.friendResponseSubscription){
      this.friendResponseSubscription.unsubscribe();
    }

    if(this.unfriendSubscription){
      this.unfriendSubscription.unsubscribe();
    }
  }

  searchUsers(): void {
    this.searchSubject.next(this.searchQuery);
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
        this.loadSentRequests();
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