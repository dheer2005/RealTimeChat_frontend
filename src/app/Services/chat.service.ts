import { HttpClient } from '@angular/common/http';
import { Inject, Injectable, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import * as signalR from '@microsoft/signalr';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { AuthenticationService } from './authentication.service';
import { Router } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  // private baseUrl = 'https://realtime001.bsite.net/api/';
  // private chatHubUrl = 'https://realtime001.bsite.net/';
  
  private baseUrl = 'https://localhost:7180/api/';
  private chatHubUrl = 'https://localhost:7180/';

  private hubConnection!: signalR.HubConnection;
  private connectionPromise: Promise<void> | null = null;
  private isConnectionStarted: boolean = false;
  
  private token: string | null = null;
  private joinedGroupName: string = '';
  private isBrowser: boolean;
  private currentChatUser: string | null = null;

  private messageHandlers: Array<(id:number, fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null,  replyTo?: { id: number, message: string, mediaUrl: string | null, isImage: boolean } | null) => void> = [];
  private groupMessageHandlers: Array<(groupName: string, fromUser: string, message: string, created: Date) => void> = [];
  
  public onlineUsers$ = new BehaviorSubject<any[]>([]);
  public typingUsers$ = new BehaviorSubject<{[key: string]: boolean}>({});
  
  private messagesSeenSubject = new Subject<string>();
  public messagesSeen$ = this.messagesSeenSubject.asObservable();

  private messagesMarkedAsSeenSubject = new Subject<string>();
  public messagesMarkedAsSeen$ = this.messagesMarkedAsSeenSubject.asObservable();

  private reactionAddedSubject  = new Subject<{messageId: number, emoji: string, user: string}>();
  public reactionAdded$ = this.reactionAddedSubject.asObservable();

  private reactionRemovedSubject = new Subject<{messageId: number, user: string}>();
  public reactionRemoved$ = this.reactionRemovedSubject.asObservable();

  private friendRequestSubject = new Subject<any>();
  public friendRequest$ = this.friendRequestSubject.asObservable();

  private friendResponseSubject = new Subject<any>();
  public friendResponse$ = this.friendResponseSubject.asObservable();

  private unfriendSubject = new Subject<any>();
  public unfriend$ = this.unfriendSubject.asObservable();

  private messageDeleteSubject = new Subject<number>();
  public messageDelete$ = this.messageDeleteSubject.asObservable();

  private sessionChangedSubject = new Subject<string>();
  public sessionChanged$ = this.sessionChangedSubject.asObservable();
  
  public connectionState$ = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );

  constructor(
    private http: HttpClient,
    private authSvc: AuthenticationService,
    @Inject(PLATFORM_ID) private platformId: Object,
    private router: Router
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
    onReceive: (id: number, fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null,  replyTo?: { id: number, message: string, mediaUrl: string | null, isImage: boolean } | null) => void,
    onReceiveGroup: (groupName: string, fromUser: string, message: string, created: Date) => void
  ): Promise<void> {
    if (!this.isBrowser) {
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
    onReceive: (id: number, fromUser: string, userTo: string, message: string, created: Date, status: string, isImage: boolean, mediaUrl: string | null,  replyTo?: { id: number, message: string, mediaUrl: string | null, isImage: boolean } | null) => void,
    onReceiveGroup: (groupName: string, fromUser: string, message: string, created: Date) => void
  ): Promise<void> {

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

      const jti = this.authSvc.getJti();
      if (jti) {
        this.hubConnection.invoke("JoinJwtGroup", jti);
      }
      
    } catch (err) {
      console.error("SignalR Connection Error:", err);
      this.isConnectionStarted = false;
      this.connectionState$.next(signalR.HubConnectionState.Disconnected);
      throw err;
    }
  }

  private setupEventHandlers(): void {
    this.hubConnection.on("ForceLogout", () => {
      console.warn("🔴 ForceLogout received: logging out now");
      this.authSvc.clearToken();
      this.router.navigate(['/login']);
    });

    this.hubConnection.on("SessionChanged", (userId:string) => {
      console.log("📢 SessionChanged received for userId:", userId);
      this.sessionChangedSubject.next(userId);
    });


    this.hubConnection.on("ReceiveMessage", (msg:any) => {
      
      const createdDate = new Date();
      
      this.messageHandlers.forEach(handler => {
        handler(msg.id, 
          msg.fromUser, 
          msg.userTo, 
          msg.message, 
          createdDate, 
          msg.status, 
          msg.isImage, 
          msg.mediaUrl, 
          msg.replyTo ? {
            id: msg.replyTo.id,
            message: msg.replyTo.message,
            mediaUrl: msg.replyTo.mediaUrl,
            isImage: msg.replyTo.isImage
          } : null);
      });

      const myUsername = this.authSvc.getUserName();
      const users = this.onlineUsers$.value;

      let targetUserName: string | null = null;

      if (msg.userTo === myUsername) {
        targetUserName = msg.fromUser;
      } else if (msg.fromUser === myUsername) {
        targetUserName = msg.userTo;
      }

      if (targetUserName) {
        const index = users.findIndex(u => u.userName === targetUserName);
        if (index !== -1) {
          users[index].lastMessage = msg.message;
          users[index].lastMessageSender = msg.fromUser;

          if (msg.userTo === myUsername && this.getCurrentChatUser() !== msg.fromUser) {
            users[index].unreadCount = (users[index].unreadCount || 0) + 1;
          }

          this.onlineUsers$.next([...users]);
        }
      }

      if (msg.userTo === myUsername && this.getCurrentChatUser() === msg.fromUser) {
        this.markAsSeen(msg.fromUser, myUsername);
      }
    });

    this.hubConnection.on("MessageDeleted", (messageId:number)=>{
      this.messageDeleteSubject.next(messageId);
    })

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

    this.hubConnection.on('ReactionAdded', (messageId: number, emoji: string, user: string) => {
      this.reactionAddedSubject.next({ messageId, emoji, user });
    });

    this.hubConnection?.on('ReactionRemoved', (messageId: number, user: string) => {
      this.reactionRemovedSubject.next({ messageId, user });
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

    this.hubConnection.on("ReceiveFriendRequest", (request:any) => {
      this.friendRequestSubject.next(request)
    });
    this.hubConnection.on("FriendRequestResponse", (response:any) => { 
      this.friendResponseSubject.next(response);
    });
    this.hubConnection.on("Unfriended", (data:any) => { 
      this.unfriendSubject.next(data);
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

  public deleteMessage(messageId: number) : void{
    if(this.hubConnection.state === signalR.HubConnectionState.Connected){
      this.hubConnection.invoke("DeleteMessage", messageId)
        .catch(err=> console.error('Error deleting message: ', err));
    } else{
      console.error("Hub connection is not active. Cannot delete message.");
    }
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

  public removeReaction(messageId: number, reactingUser: string) {
    this.hubConnection?.invoke('RemoveReaction', messageId, reactingUser);
  }

  public addReaction(messageId: number, emoji: string, reactingUser: string) {
    this.hubConnection?.invoke('AddReaction', messageId, emoji, reactingUser);
  }

  public sendMessage(FromUser: string, UserTo: string, message: string, Created: Date, Status: 'seen' | 'sent', isImage: boolean, mediaUrl: string | null, replyToMessageId?: number): void {
    if (!this.isBrowser || !this.hubConnection) {
      return;
    }

    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessage", FromUser, UserTo, message, Created, Status, isImage, mediaUrl, replyToMessageId)
        .catch(err => console.error("Error sending message:", err));
    } else {
      console.warn("SignalR not connected. Message not sent via SignalR.");
    }
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

  public getMessages(userTo: string): Observable<any> {
    return this.http.get(`${this.baseUrl}Chat/${userTo}`, this.authSvc.getHttpOptions());
  }
  
  public SaveGroupChats(grpMessage: any): Observable<any> {
    return this.http.post(`${this.baseUrl}Chat/groupChat`, grpMessage, this.authSvc.getHttpOptions());
  }

  public getGroupMessages(groupName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Chat/getGroupMessages/${groupName}`, this.authSvc.getHttpOptions());
  }

  public unreadCount(userTo: string) {
    return this.http.get<any[]>(`${this.baseUrl}Chat/unread-counts/${userTo}`, this.authSvc.getHttpOptions());
  }

  public lastMessage(userName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Chat/lastMessages/${userName}`, this.authSvc.getHttpOptions());
  }

  public async stopConnection(): Promise<void> {
    if (this.isBrowser && this.hubConnection && this.isConnectionStarted) {
      try {
        await this.hubConnection.stop();
        this.isConnectionStarted = false;
        this.connectionState$.next(signalR.HubConnectionState.Disconnected);
        this.messageHandlers = [];
        this.groupMessageHandlers = [];
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