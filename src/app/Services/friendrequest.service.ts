import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { AuthenticationService } from './authentication.service';

@Injectable({
  providedIn: 'root'
})
export class FriendrequestService {
  private baseUrl = 'https://realtime001.bsite.net/api/Friend';

  // private baseUrl = 'https://localhost:7180/api/Friend';
  
  // private baseUrl = 'https://10.0.0.43:5000/api/Friend';

  constructor(private http: HttpClient, private authSvc: AuthenticationService) { }

  sendFriendRequest(data: any) {
    return this.http.post(`${this.baseUrl}/send-request`, data, this.authSvc.getHttpOptions());
  }
  
  getFriendRequestResponse(data : any){
    return this.http.post(`${this.baseUrl}/friend-request-response`, data, this.authSvc.getHttpOptions());
  }

  getFriendsList(userId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/friends/${userId}`, this.authSvc.getHttpOptions());
  }

  getPendingRequests(userId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/requests/${userId}`, this.authSvc.getHttpOptions());
  }

  searchUsers(query: string, currentUserId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/search/${query}/${currentUserId}`, this.authSvc.getHttpOptions());
  }

  unfriend(currentUserId: string, friendId: string) {
    return this.http.delete(`${this.baseUrl}/unfriend/${currentUserId}/${friendId}`, this.authSvc.getHttpOptions());
  }

  getSentRequests(userId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/sent-requests/${userId}`, this.authSvc.getHttpOptions());
  }

}
