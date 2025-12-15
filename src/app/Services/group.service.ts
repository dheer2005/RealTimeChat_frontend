import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';

export interface CreateGroupDto {
  groupName: string;
  groupImage?: string;
  memberUserIds: string[];
}

export interface GroupDetails {
  id: number;
  groupName: string;
  groupImage?: string;
  createdBy: string;
  createdAt: Date;
  members: GroupMember[];
  lastMessage?: GroupMessage;
  unreadCount: number;
  typingUsers?: string[];
  typingText?: string;
}

export interface GroupMember {
  userId: string;
  userName: string;
  profileImage?: string;
  isAdmin: boolean;
  joinedAt: Date;
}

export interface GroupMessage {
  id: number;
  groupId: number;
  fromUser: string;
  message: string;
  isImage: boolean;
  mediaUrl?: string;
  created: Date;
  status: string;
  replyToMessageId?: number;
  replyTo?: GroupMessage;
}

@Injectable({
  providedIn: 'root'
})
export class GroupService {
  private apiUrl = 'https://realtime001.bsite.net/api/Group';
  
  // private apiUrl = 'https://localhost:7180/api/Group';

  public currentGroupId$ = new BehaviorSubject<number | null>(null);
  public groupUpdated$ = new BehaviorSubject<any>(null);
  public memberAdded$ = new BehaviorSubject<any>(null);
  public memberRemoved$ = new BehaviorSubject<any>(null);

  constructor(
    private http: HttpClient,
    private authSvc: AuthenticationService
  ) { }

  private getHeaders(): HttpHeaders {
    const token = this.authSvc.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    });
  }

  createGroup(dto: CreateGroupDto): Observable<any> {
    return this.http.post(`${this.apiUrl}/create`, dto, {
      headers: this.getHeaders()
    });
  }

  getMyGroups(): Observable<GroupDetails[]> {
    return this.http.get<GroupDetails[]>(`${this.apiUrl}/my-groups`, {
      headers: this.getHeaders()
    });
  }

  getGroupMessages(groupId: number): Observable<GroupMessage[]> {
    return this.http.get<GroupMessage[]>(`${this.apiUrl}/${groupId}/messages`, {
      headers: this.getHeaders()
    });
  }

  getGroupDetails(groupId: number): Observable<GroupDetails> {
    return this.http.get<GroupDetails>(`${this.apiUrl}/${groupId}/details`, {
      headers: this.getHeaders()
    });
  }

  updateGroup(groupId: number, groupName?: string, groupImage?: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/update`, {
      groupId,
      groupName,
      groupImage
    }, {
      headers: this.getHeaders()
    });
  }

  addMembers(groupId: number, userIds: string[]): Observable<any> {
    return this.http.post(`${this.apiUrl}/add-members`, {
      groupId,
      userIds
    }, {
      headers: this.getHeaders()
    });
  }

  removeMember(groupId: number, userId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/remove-member`, {
      groupId,
      userId
    }, {
      headers: this.getHeaders()
    });
  }

  makeAdmin(adminDto:any): Observable<any> {
    return this.http.post(`${this.apiUrl}/make-admin`, adminDto, {headers: this.getHeaders()});
  }

  removeAdmin(dto: { groupId: number; userId: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/remove-admin`, dto, this.authSvc.getHttpOptions());
  }

  deleteGroup(groupId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete/${groupId}`, this.authSvc.getHttpOptions());
  }

  setCurrentGroup(groupId: number): void {
    this.currentGroupId$.next(groupId);
  }
}
