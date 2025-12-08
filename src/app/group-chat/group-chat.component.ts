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
  showScrollButton: boolean = false;
  private userScrolled: boolean = false;

  constructor(private chatSvc: ChatService, private authSvc: AuthenticationService, private location: Location) {
    this.fromUser = this.authSvc.getUserName();
  }

  groupChatBack(){
    this.location.back();
  }

  private setupScrollListener(): void {
    const scrollContainer = document.getElementById('group-chat-scroll');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', (event: Event) => {
        const element = event.target as HTMLElement;
        const threshold = 150; // pixels from bottom
        const atBottom = element.scrollHeight - element.scrollTop - element.clientHeight < threshold;
        
        this.showScrollButton = !atBottom;
        this.userScrolled = !atBottom;
      });
    }
  }

  ngOnInit(): void {
    this.chatSvc.startConnection(this.fromUser,
      () => {},
      (groupName, fromUser, message, created) => {
        if (groupName === this.groupName) {
          this.messages.push({ groupName, fromUser, message, created });
          if (!this.userScrolled) {
            setTimeout(() => this.scrollToBottom(), 100);
          }
        }
      },
      ).then(() => {
      this.chatSvc.joinGroup(this.groupName);
      this.chatSvc.getGroupMessages(this.groupName).subscribe((res: any[]) => {
        this.messages = res;
        this.isLoader = false;
        setTimeout(() => {
          this.scrollToBottom();
          this.setupScrollListener();
        }, 100);
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
  
      this.message = '';
      setTimeout(() => this.scrollToBottom(true), 100);
    }
  }

  isNewDate(i: number): boolean {
    if (i === 0) return true;

    const current = new Date(this.messages[i].created);
    const previous = new Date(this.messages[i - 1].created);

    return (
      current.getFullYear() !== previous.getFullYear() ||
      current.getMonth() !== previous.getMonth() ||
      current.getDate() !== previous.getDate()
    );
  }

  getDateLabel(date: any): string {
    const d = new Date(date);
    const today = new Date();

    if (
      d.getDate() === today.getDate() &&
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear()
    ) {
      return 'Today';
    }

    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (
      d.getDate() === yesterday.getDate() &&
      d.getMonth() === yesterday.getMonth() &&
      d.getFullYear() === yesterday.getFullYear()
    ) {
      return 'Yesterday';
    }

    return d.toDateString();
  }

  scrollToBottom(smooth: boolean = false) {
    const element = document.getElementById('group-chat-scroll');
    if (element) {
      if (smooth) {
        element.scrollTo({
          top: element.scrollHeight,
          behavior: 'smooth'
        });
      } else {
        element.scrollTop = element.scrollHeight;
      }
      
      this.showScrollButton = false;
      this.userScrolled = false;
    }
  }
}
