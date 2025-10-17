import { Component, OnInit } from '@angular/core';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import $ from 'jquery';
@Component({
  selector: 'app-group-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-chat.component.html',
  styleUrl: './group-chat.component.css'
})
export class GroupChatComponent implements OnInit {

  messages: any[] = [];
  message: string = '';
  fromUser: string = '';
  groupName: string = 'AngularDevs'; 
  isLoader: boolean = true;

  constructor(private chatSvc: ChatService, private authSvc: AuthenticationService, private location: Location) {
    this.fromUser = this.authSvc.getUserName();
  }

  groupChatBack(){
    this.location.back();
  }

  ngOnInit(): void {
    this.chatSvc.startConnection(this.fromUser,
      () => {},
      (groupName, fromUser, message, created) => {
        if (groupName === this.groupName) {
          this.messages.push({ groupName, fromUser, message, created });
          setTimeout(() => this.scrollToBottom(), 100);
        }
      },
      ).then(() => {
      this.chatSvc.joinGroup(this.groupName);
      this.chatSvc.getGroupMessages(this.groupName).subscribe((res: any[]) => {
        this.messages = res;
        this.isLoader = false;
        setTimeout(() => this.scrollToBottom(), 100);
      });
    });
  }

  send() {
    if (this.message.trim()) {
      const created = new Date();
      this.chatSvc.sendMessageToGroup(this.groupName, this.fromUser, this.message, created);
      const groupMsg = {
        GroupName: this.groupName,
        FromUser: this.fromUser,
        Message: this.message,
        Created: created,
        Status: 'sent'
      };
  
      this.chatSvc.SaveGroupChats(groupMsg).subscribe();
      this.message = '';
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  scrollToBottom() {
    $('#group-chat-scroll').stop().animate({
      scrollTop: $('#group-chat-scroll')[0].scrollHeight
    }, 300);
  }
}
