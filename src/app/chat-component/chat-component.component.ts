import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ChatService } from '../Services/chat.service';
import { AuthenticationService } from '../Services/authentication.service';
import { VideoService } from '../Services/video.service';
import { ProfileDescriptionComponent } from '../profile-description/profile-description.component';
import $ from 'jquery';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog } from '@angular/material/dialog';
import { VideoChatComponent } from '../video-chat/video-chat.component';


@Component({
  selector: 'app-chat-component',
  standalone: true,
  imports: [FormsModule, CommonModule, RouterLink, ProfileDescriptionComponent, MatIconModule],
  templateUrl: './chat-component.component.html',
  styleUrl: './chat-component.component.css'
})

export class ChatComponent implements OnInit, OnDestroy{

  

  messages: any[] = [];
  UserTo: any;
  user = '';
  message = '';
  fromUser = '';
  Receiver = '';
  currentTime = new Date();
  profileClicked: boolean = false;
  status: 'seen' | 'sent' = 'sent';
  isLoader: boolean = false;



  constructor(private activatedRoute: ActivatedRoute, private chatService: ChatService, private authSvc: AuthenticationService, private signalRService: VideoService , private router: Router, public dialog: MatDialog){
    this.activatedRoute.paramMap.subscribe(param=>{
      this.UserTo = param.get('name');
    });
    this.fromUser = this.authSvc.getUserName();
  }

  
  

  async ngOnInit(): Promise<void> {
      // setInterval(() => {
      //   this.chatService.getMessages(this.fromUser, this.UserTo).subscribe((res: any) => {
      //     this.messages = res.map((msg: any) => ({
      //       id: msg.id, 
      //       fromUser: msg.fromUser,
      //       userTo: msg.userTo,
      //       message: msg.message,
      //       created: new Date(msg.created),
      //       status: msg.status
      //     })).sort((a:any, b:any) => a.created.getTime() - b.created.getTime());

      //     this.authSvc.markMessagesAsSeen(this.fromUser, this.UserTo).subscribe(()=>{
      //     });
      //   });

      // }, 1000);
      this.chatService.startConnection(this.fromUser, (FromUser,userTo, message, Created, Status) => {
        if((this.UserTo == FromUser && this.fromUser == userTo) || (this.fromUser == FromUser && this.UserTo == userTo)){
          this.messages.push({ fromUser: FromUser,userTo, message, created: new Date(Created), status: Status});
          setTimeout(() => this.scrollToBottom(), 100);
        }  
        },
        () => {},
        ).then(() => {
          this.chatService.getMessages(this.fromUser, this.UserTo).subscribe((res: any) => {
            this.messages = res.map((msg: any) => ({
              id: msg.id, 
              fromUser: msg.fromUser,
              userTo: msg.userTo,
              message: msg.message,
              created: new Date(msg.created),
              status: msg.status
            })).sort((a:any, b:any) => a.created.getTime() - b.created.getTime()); 
            this.isLoader = false;        
            setTimeout(() => this.scrollToBottom(), 100);
          });
        });
  }

  send() {
    if (this.message.trim()) {
      this.Receiver = this.UserTo;
      this.chatService.sendMessage(this.fromUser, this.UserTo, this.message, this.currentTime, this.status);
      this.message = '';
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  displayDialog(Userto:string){
    this.signalRService.remoteUserId = Userto;
    // this.dialog.closeAll();
      this.signalRService.isOpen = true;
      this.dialog.open(VideoChatComponent,{
        width: '400px',
        height: '550px',
        disableClose: true,
        autoFocus: false
      })
  }

  userDesc(userTo: string){
    this.profileClicked = true;
  }

  exitProfile(){
    this.profileClicked = false;
  }


  scrollToBottom() {
    $('#chat-scroll').stop().animate({
      scrollTop: $('#chat-scroll')[0].scrollHeight
    }, 300);
  }


  ngOnDestroy(): void {
      this.UserTo = null;
      this.fromUser = '';
  }
}
