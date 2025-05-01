import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthenticationService } from '../Services/authentication.service';
import { ChatService } from '../Services/chat.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, FormsModule, CommonModule],
  templateUrl: './home.component.html',
  styleUrl: './home.component.css'
})
export class HomeComponent implements OnInit {
  public usersList: any[] = [];
  public userName: any;
  public userList2: any[]=[];
  IsLoader: boolean = false;
  lastMessageList: any[] = [];
  filter:string = '';

  constructor(private authSvc: AuthenticationService, private router: Router, private activatedRoute: ActivatedRoute, private chatService: ChatService){  }

  ngOnInit(): void {
    this.userName = this.authSvc.getUserName();
    
    const fetchUsers = () => {
      this.authSvc.getAllUsers(this.userName).subscribe({
        next: (res: any) => {
          this.usersList = res;
          this.userList2 = [...res];
        },
        error: (err) => {
          console.error('Error fetching users:', err);
        }
      });
      console.log(this.userList2);
    };
    
    fetchUsers(); 

    setInterval(() => {
      fetchUsers(); 
    }, 1000);
  }
  

  onKeyPress(event: any){
    this.filter = event.target.value;
  }

  filteredList(){
    console.log(this.userList2);
    return this.filter === ''? this.userList2 : this.userList2.filter((users:any)=> users?.userName.includes(this.filter));
  }

  userCard(userName: string){
    this.router.navigate(['chats', userName])
  }

}
