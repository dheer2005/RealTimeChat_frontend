import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { AuthenticationService } from './authentication.service';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private baseUrl = 'https://realtime001.bsite.net/api/';
  private chatHubUrl = 'https://realtime001.bsite.net/';
  
  // private baseUrl = 'https://localhost:7180/api/';
  // private chatHubUrl = 'https://localhost:7180/';
  
  private hubConnection!: signalR.HubConnection;
  private connectionPromise: Promise<void> | null = null;
  private isConnectionStarted: boolean = false;
  
  private token: string | null = null;
  private joinedGroupName: string = '';
  private isBrowser: boolean;
  private currentChatUser: string | null = null;

  private messageHandlers: Array<(fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null) => void> = [];
  private groupMessageHandlers: Array<(groupName: string, fromUser: string, message: string, created: Date) => void> = [];
  
  public onlineUsers$ = new BehaviorSubject<any[]>([]);
  public typingUsers$ = new BehaviorSubject<{[key: string]: boolean}>({});
  
  private messagesSeenSubject = new Subject<string>();
  public messagesSeen$ = this.messagesSeenSubject.asObservable();

  private messagesMarkedAsSeenSubject = new Subject<string>();
  public messagesMarkedAsSeen$ = this.messagesMarkedAsSeenSubject.asObservable();
  
  public connectionState$ = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  constructor(
    private http: HttpClient,
    private authSvc: AuthenticationService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  setCurrentChatUser(userName: string | null) {
    this.currentChatUser = userName;
  }

  getCurrentChatUser(): string | null {
    return this.currentChatUser;
  }

  public async startConnection(
    FromUser: string, 
    onReceive: (fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null) => void,
    onReceiveGroup: (groupName: string, fromUser: string, message: string, created: Date) => void
  ): Promise<void> {
    if (!this.isBrowser) {
      console.log("Skipping SignalR connection - not in browser");
      return;
    }

    if (this.isConnectionStarted && this.hubConnection) {
      
      if (!this.messageHandlers.includes(onReceive)) {
        this.messageHandlers.push(onReceive);
      }
      if (!this.groupMessageHandlers.includes(onReceiveGroup)) {
        this.groupMessageHandlers.push(onReceiveGroup);
      }
      
      return;
    }

    if (this.connectionPromise) {
      console.log("Connection in progress - waiting...");
      await this.connectionPromise;
      
      if (!this.messageHandlers.includes(onReceive)) {
        this.messageHandlers.push(onReceive);
      }
      if (!this.groupMessageHandlers.includes(onReceiveGroup)) {
        this.groupMessageHandlers.push(onReceiveGroup);
      }
      
      return;
    }

    this.token = this.authSvc.getToken();
    
    if (!this.token) {
      console.warn("No token available for SignalR connection");
      return;
    }

    this.connectionPromise = this.initializeConnection(FromUser, onReceive, onReceiveGroup);
    
    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  private async initializeConnection(
    FromUser: string,
    onReceive: (fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null) => void,
    onReceiveGroup: (groupName: string, fromUser: string, message: string, created: Date) => void
  ): Promise<void> {
    console.log("Initializing new SignalR connection...");

    this.messageHandlers.push(onReceive);
    this.groupMessageHandlers.push(onReceiveGroup);

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${this.chatHubUrl}chat`, {
        accessTokenFactory: () => this.token!,
        withCredentials: false
      })
      .withAutomaticReconnect()
      .build();

    this.setupEventHandlers();
    this.setupConnectionHandlers();
   
    try {
      await this.hubConnection.start();
      this.isConnectionStarted = true;
      this.connectionState$.next(signalR.HubConnectionState.Connected);
      console.log("SignalR Connected successfully");
    } catch (err) {
      console.error("SignalR Connection Error:", err);
      this.isConnectionStarted = false;
      this.connectionState$.next(signalR.HubConnectionState.Disconnected);
      throw err;
    }
  }

  private setupEventHandlers(): void {
    this.hubConnection.on("ReceiveMessage", (fromUser: string, userTo: string, message: string, created: string, status: string, isImage: boolean, mediaUrl: string | null) => {
      const createdDate = new Date(created);
      
      this.messageHandlers.forEach(handler => {
        handler(fromUser, userTo, message, createdDate, status, isImage, mediaUrl);
      });

      const currentUser = this.getCurrentChatUser();
      const myUsername = this.authSvc.getUserName();
      
      if (userTo === myUsername && currentUser !== fromUser) {
        const users = this.onlineUsers$.value;
        const index = users.findIndex(u => u.userName === fromUser);
        if (index !== -1) {
          users[index].unreadCount = (users[index].unreadCount || 0) + 1;
          users[index].lastMessage = message;
          users[index].lastMessageSender = fromUser;
          this.onlineUsers$.next([...users]);
        }
      }

      if (userTo === myUsername && currentUser === fromUser) {
        setTimeout(() => {
          this.markAsSeen(fromUser, myUsername);
        }, 100);
      }
    });

    this.hubConnection.on("MessagesSeen", (seenByUser: string) => {
      this.messagesSeenSubject.next(seenByUser);
    });

    this.hubConnection.on("MessagesMarkedAsSeen", (user: string) => {
      this.messagesMarkedAsSeenSubject.next(user);
    });

    this.hubConnection.on("ReceiveGroupMessage", (groupName: string, fromUser: string, message: string, created: string) => {
      if (groupName === this.joinedGroupName) {
        const createdDate = new Date(created);
        this.groupMessageHandlers.forEach(handler => {
          handler(groupName, fromUser, message, createdDate);
        });
      }
    });

    this.hubConnection.on("OnlineUsers", (users: any[]) => {
      this.onlineUsers$.next(users);
    });

    this.hubConnection.on("UserOnline", (userName: string) => {
      const currentUsers = this.onlineUsers$.value;
      const userIndex = currentUsers.findIndex(u => u.userName === userName);
      if (userIndex !== -1) {
        currentUsers[userIndex].isOnline = true;
        this.onlineUsers$.next([...currentUsers]);
      }
    });

    this.hubConnection.on("UserOffline", (userName: string) => {
      const currentUsers = this.onlineUsers$.value;
      const userIndex = currentUsers.findIndex(u => u.userName === userName);
      if (userIndex !== -1) {
        currentUsers[userIndex].isOnline = false;
        this.onlineUsers$.next([...currentUsers]);
      }
    });

    this.hubConnection.on("UserTyping", (userName: string) => {
      const typing = this.typingUsers$.value;
      typing[userName] = true;
      this.typingUsers$.next({...typing});

      setTimeout(() => {
        const current = this.typingUsers$.value;
        if (current[userName]) {
          delete current[userName];
          this.typingUsers$.next({...current});
        }
      }, 3000);
    });

    this.hubConnection.on("UserStopTyping", (userName: string) => {
      const typing = this.typingUsers$.value;
      delete typing[userName];
      this.typingUsers$.next({...typing});
    });
  }

  private setupConnectionHandlers(): void {
    this.hubConnection.onreconnecting(() => {
      this.connectionState$.next(signalR.HubConnectionState.Reconnecting);
    });

    this.hubConnection.onreconnected(() => {
      this.connectionState$.next(signalR.HubConnectionState.Connected);
      if (this.joinedGroupName) {
        this.joinGroup(this.joinedGroupName);
      }
    });

    this.hubConnection.onclose(() => {
      this.isConnectionStarted = false;
      this.connectionState$.next(signalR.HubConnectionState.Disconnected);
      this.messageHandlers = [];
      this.groupMessageHandlers = [];
    });
  }

  public markAsSeen(fromUser: string, userTo: string): void {
    if (!this.isBrowser || !this.hubConnection) {
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("MarkAsSeen", fromUser, userTo)
        .then(() => {
          const users = this.onlineUsers$.value;
          const index = users.findIndex(u => u.userName === fromUser);
          if (index !== -1) {
            users[index].unreadCount = 0;
            this.onlineUsers$.next([...users]);
          }
        })
        .catch(err => console.error('Error invoking MarkAsSeen:', err));
    }
  }

  public sendMessage(FromUser: string, UserTo: string, message: string, Created: Date, Status: 'seen' | 'sent', isImage: boolean, mediaUrl: string | null): void {
    if (!this.isBrowser || !this.hubConnection) {
      console.warn("SignalR not available");
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessage", FromUser, UserTo, message, Created, Status, isImage, mediaUrl)
        .catch(err => console.error("Error sending message:", err));
    } else {
      console.warn("SignalR not connected. Message not sent via SignalR.");
    }
    

    console.log("Saving message to database:", { FromUser, UserTo, message, Created, Status, isImage, mediaUrl });
    this.saveMessage({ FromUser, UserTo, message, Created, Status, isImage, mediaUrl });
  }

  public notifyTyping(recipientUserName: string): void {
    if (!this.isBrowser || !this.hubConnection) {
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("NotifyTyping", recipientUserName)
        .catch(err => console.error("Error sending typing notification:", err));
    }
  }

  public notifyStopTyping(recipientUserName: string): void {
    if (!this.isBrowser || !this.hubConnection) {
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("NotifyStopTyping", recipientUserName)
        .catch(err => console.error("Error sending stop typing notification:", err));
    }
  }

  public isUserTyping(userName: string): boolean {
    return this.typingUsers$.value[userName] || false;
  }

  public getTypingUsers(): string[] {
    return Object.keys(this.typingUsers$.value).filter(key => this.typingUsers$.value[key]);
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
      console.warn("SignalR not connected. Message not sent via SignalR.");
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
      next: () => console.log("Message saved to database"),
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

  public async stopConnection(): Promise<void> {
    if (this.isBrowser && this.hubConnection && this.isConnectionStarted) {
      try {
        await this.hubConnection.stop();
        this.isConnectionStarted = false;
        this.connectionState$.next(signalR.HubConnectionState.Disconnected);
        this.messageHandlers = [];
        this.groupMessageHandlers = [];
        console.log("SignalR connection stopped successfully");
      } catch (err) {
        console.error("Error stopping SignalR connection:", err);
      }
    }
  }

  public isConnected(): boolean {
    return this.isConnectionStarted && this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  public getConnectionState(): signalR.HubConnectionState {
    return this.hubConnection?.state || signalR.HubConnectionState.Disconnected;
  }
}