import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class FriendrequestService {
  private baseUrl = 'https://realtime001.bsite.net/api/Friend';

  // private baseUrl = 'https://localhost:7180/api/Friend';

  constructor(private http: HttpClient) { }

  sendFriendRequest(data: any) {
    return this.http.post(`${this.baseUrl}/send-request`, data);
  }
  
  getFriendRequestResponse(data : any){
    return this.http.post(`${this.baseUrl}/friend-request-response`, data);
  }

  getFriendsList(userId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/friends/${userId}`);
  }

  getPendingRequests(userId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/requests/${userId}`);
  }

  searchUsers(query: string, currentUserId: string) {
    return this.http.get<any[]>(`${this.baseUrl}/search/${query}/${currentUserId}`);
  }

  unfriend(currentUserId: string, friendId: string) {
    return this.http.delete(`${this.baseUrl}/unfriend/${currentUserId}/${friendId}`);
  }

}
