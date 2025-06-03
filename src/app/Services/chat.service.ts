import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable } from 'rxjs';
import { AuthenticationService } from './authentication.service';


@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private hubConnection! : signalR.HubConnection;
  private baseUrl = 'https://chatify.bsite.net/api/';
  private chatHubUrl = 'https://chatify.bsite.net/';
  // private baseUrl = 'https://localhost:7180/api/';
  // private chatHubUrl = 'https://localhost:7180/';
  private token:any;
  

  constructor(private http: HttpClient, private authSvc: AuthenticationService){  }

  public async startConnection(FromUser: string, onReceive: (...args: any[])=>void,
  onReceiveGroup: (...args: any[]) => void): Promise<void>{
    this.token = this.authSvc.getToken();
    this.hubConnection = new signalR.HubConnectionBuilder()
    .withUrl(`${this.chatHubUrl}chat`, {
      accessTokenFactory: ()=> this.token!,
      withCredentials: false
    })
    .withAutomaticReconnect()
    .build();
   
    this.hubConnection.on("ReceiveMessage", (fromUser: string, userTo:string, message: string, created: string, status: string) => {
      onReceive(fromUser, userTo, message, new Date(created), status);
    });

    this.hubConnection.on("ReceiveGroupMessage", (groupName, fromUser, message, created) => {
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

  public sendMessage(FromUser: string, UserTo: string, message: string, Created: Date, Status: 'seen' | 'sent') {
    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessage", FromUser, UserTo, message, Created, Status);
    } else {
      console.warn("SignalR not connected. Message not sent.");
    }
    console.log({ FromUser : FromUser, UserTo: UserTo, message,Created, Status })
    this.saveMessage({ FromUser : FromUser, UserTo: UserTo, message, Created, Status });
  }

  private joinedGroupName: string = '';
  public joinGroup(groupName: string): Promise<void> {
    this.joinedGroupName = groupName;
    return this.hubConnection.invoke("JoinGroup", groupName);
  }
  
  public leaveGroup(groupName: string): Promise<void> {
    return this.hubConnection.invoke("LeaveGroup", groupName);
  }

  public sendMessageToGroup(groupName: string, fromUser: string, message: string, created: Date) {
    if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
      this.hubConnection.invoke("SendMessageToGroup", groupName, fromUser, message, created);
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
  
    this.SaveGroupChats(groupMsg);
  }
  
  private saveMessage(message: any) {
    return this.http.post(`${this.baseUrl}Chat`, message).subscribe();
  }

  public getMessages(fromUser: string, userTo: string) {
    return this.http.get(`${this.baseUrl}Chat/${fromUser}/${userTo}`);
  }
  
  public SaveGroupChats(grpMessage: any){
    return this.http.post(`${this.baseUrl}Chat/groupChat`, grpMessage);
  }

  public getGroupMessages(groupName: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}Chat/getGroupMessages/${groupName}`);
  }

  public unreadCount(){
    return this.http.get<any[]>(`${this.baseUrl}Seen/messages/unread-counts`);
  }

  public lastMessage(userName:string){
    return this.http.get<any[]>(`${this.baseUrl}Chat/lastMessages/${userName}`);
  }
}






