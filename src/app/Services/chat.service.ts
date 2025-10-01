import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as signalR from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { AuthenticationService } from './authentication.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private hubConnection!: signalR.HubConnection;

  private baseUrl = 'https://chatify.bsite.net/api/';
  private chatHubUrl = 'https://chatify.bsite.net/';
  
  // private baseUrl = 'https://localhost:7180/api/';
  // private chatHubUrl = 'https://localhost:7180/';
  private token: string | null = null;
  private joinedGroupName: string = '';
  private isBrowser: boolean;

  constructor(
    private http: HttpClient, 
    private authSvc: AuthenticationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  public async startConnection(
    FromUser: string, 
    onReceive: (fromUser: string, userTo: string, message: string, created: Date, status: string) => void,
    onReceiveGroup: (groupName: string, fromUser: string, message: string, created: Date) => void
  ): Promise<void> {
    // Only start connection in browser
    if (!this.isBrowser) {
      console.log("Skipping SignalR connection - not in browser");
      return;
    }

    this.token = this.authSvc.getToken();
    
    if (!this.token) {
      console.warn("No token available for SignalR connection");
      return;
    }

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.chatHubUrl}chat`, {
        accessTokenFactory: () => this.token!,
        withCredentials: false
      })
      .withAutomaticReconnect()
      .build();
   
    this.hubConnection.on("ReceiveMessage", (fromUser: string, userTo: string, message: string, created: string, status: string) => {
      onReceive(fromUser, userTo, message, new Date(created), status);
    });

    this.hubConnection.on("ReceiveGroupMessage", (groupName: string, fromUser: string, message: string, created: string) => {
      if (groupName === this.joinedGroupName) {
        onReceiveGroup(groupName, fromUser, message, new Date(created));
      }
    });
   
    try {
      await this.hubConnection.start();
      console.log("SignalR Connected.");
    } catch (err) {
      console.error("SignalR Connection Error:", err);
    }
  }

  public sendMessage(FromUser: string, UserTo: string, message: string, Created: Date, Status: 'seen' | 'sent'): void {
    if (!this.isBrowser || !this.hubConnection) {
      console.warn("SignalR not available");
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessage", FromUser, UserTo, message, Created, Status)
        .catch(err => console.error("Error sending message:", err));
    } else {
      console.warn("SignalR not connected. Message not sent.");
    }
    
    console.log({ FromUser, UserTo, message, Created, Status });
    this.saveMessage({ FromUser, UserTo, message, Created, Status });
  }

  public joinGroup(groupName: string): Promise<void> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.resolve();
    }

    this.joinedGroupName = groupName;
    return this.hubConnection.invoke("JoinGroup", groupName);
  }
  
  public leaveGroup(groupName: string): Promise<void> {
    if (!this.isBrowser || !this.hubConnection) {
      return Promise.resolve();
    }

    return this.hubConnection.invoke("LeaveGroup", groupName);
  }

  public sendMessageToGroup(groupName: string, fromUser: string, message: string, created: Date): void {
    if (!this.isBrowser || !this.hubConnection) {
      console.warn("SignalR not available");
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessageToGroup", groupName, fromUser, message, created)
        .catch(err => console.error("Error sending group message:", err));
    } else {
      console.warn("SignalR not connected. Message not sent.");
    }
  
    const groupMsg = {
      GroupName: groupName,
      FromUser: fromUser,
      Message: message,
      Created: created,
      Status: 'Sent'
    };
  
    this.SaveGroupChats(groupMsg).subscribe({
      next: () => console.log("Group message saved"),
      error: (err) => console.error("Error saving group message:", err)
    });
  }
  
  private saveMessage(message: any): void {
    this.http.post(`${this.baseUrl}Chat`, message).subscribe({
      next: () => console.log("Message saved"),
      error: (err) => console.error("Error saving message:", err)
    });
  }

  public getMessages(fromUser: string, userTo: string): Observable<any> {
    return this.http.get(`${this.baseUrl}Chat/${fromUser}/${userTo}`);
  }
  
  public SaveGroupChats(grpMessage: any): Observable<any> {
    return this.http.post(`${this.baseUrl}Chat/groupChat`, grpMessage);
  }

  public getGroupMessages(groupName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Chat/getGroupMessages/${groupName}`);
  }

  public unreadCount(): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Seen/messages/unread-counts`);
  }

  public lastMessage(userName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Chat/lastMessages/${userName}`);
  }

  public stopConnection(): void {
    if (this.isBrowser && this.hubConnection) {
      this.hubConnection.stop()
        .then(() => console.log("SignalR connection stopped"))
        .catch(err => console.error("Error stopping SignalR connection:", err));
    }
  }
}  