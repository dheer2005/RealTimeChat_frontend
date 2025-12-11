import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { GroupService, GroupDetails, GroupMember } from '../Services/group.service';
import { AuthenticationService } from '../Services/authentication.service';
import { FriendrequestService } from '../Services/friendrequest.service';
import { AlertService } from '../Services/alert.service';
import { Subscription } from 'rxjs';
import Swal from 'sweetalert2';
import { ChatService } from '../Services/chat.service';

@Component({
  selector: 'app-group-info',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './group-info.component.html',
  styleUrl: './group-info.component.css'
})
export class GroupInfoComponent implements OnInit, OnDestroy {
  groupId: number = 0;
  groupDetails?: GroupDetails;
  isAdmin: boolean = false;
  currentUserId: string = '';
  currentUserName: string = '';
  isEditingName: boolean = false;
  newGroupName: string = '';
  newGroupImage: string = '';
  friends: any[] = [];
  showAddMembersModal: boolean = false;
  selectedFriends: string[] = [];
  isLoading: boolean = true;
  
  private routeSub?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private groupSvc: GroupService,
    private authSvc: AuthenticationService,
    private friendSvc: FriendrequestService,
    private chatSvc: ChatService,
    private alertSvc: AlertService
  ) {
    this.currentUserId = this.authSvc.getUserId();
    this.currentUserName = this.authSvc.getUserName();
  }

  async ngOnInit(): Promise<void> {
    this.routeSub = this.route.params.subscribe(async params => {
      this.groupId = +params['groupId'];
      if (this.groupId) {
        await this.chatSvc.startConnection(
          this.currentUserName,
          () => {},
          () => {}
        );

        await this.chatSvc.joinGroupRoom(this.groupId);
        this.loadGroupDetails();
      }
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  loadGroupDetails(): void {
    this.groupSvc.getGroupDetails(this.groupId).subscribe({
      next: (data) => {
        this.groupDetails = data;
        this.newGroupName = data.groupName;
        this.newGroupImage = data.groupImage || '';
        this.isAdmin = data.members.some(m => m.userId === this.currentUserId && m.isAdmin);
        this.isLoading = false;
      },
      error: (err) => {
        this.alertSvc.error('Failed to load group details');
        console.error(err);
        this.isLoading = false;
      }
    });
  }

  goBack(): void {
    this.location.back();
  }

  toggleEditName(): void {
    if (!this.isAdmin) {
      this.alertSvc.warning('Only admins can edit group name');
      return;
    }
    this.isEditingName = !this.isEditingName;
    if (!this.isEditingName) {
      this.newGroupName = this.groupDetails?.groupName || '';
    }
  }

  saveGroupName(): void {
    const name = this.newGroupName.trim();
    if (!name) {
      this.alertSvc.warning('Group name cannot be empty');
      return;
    }

    this.groupSvc.updateGroup(this.groupId, name, undefined).subscribe({
      next: () => {
        if (this.groupDetails) {
          this.groupDetails.groupName = name;
        }

        this.chatSvc.notifyGroupUpdated(this.groupId, name, this.newGroupImage);

        this.isEditingName = false;
        this.alertSvc.success('Group name updated');
      },
      error: (err) => {
        this.alertSvc.error('Failed to update group name');
        console.error(err);
      }
    });
  }

  updateGroupImage(): void {
    if (!this.isAdmin) {
      this.alertSvc.warning('Only admins can update group image');
      return;
    }

    Swal.fire({
      title: 'Update Group Image',
      input: 'text',
      inputLabel: 'Image URL',
      inputValue: this.newGroupImage,
      showCancelButton: true,
      confirmButtonText: 'Update'
    }).then((result) => {
      if (result.isConfirmed) {
        const img = result.value;

        this.groupSvc.updateGroup(this.groupId, undefined, img).subscribe({
          next: () => {
            if (this.groupDetails) {
              this.groupDetails.groupImage = img;
              this.newGroupImage = img;
            }

            // 🔥 Send realtime update
            this.chatSvc.notifyGroupUpdated(this.groupId, this.newGroupName, img);

            this.alertSvc.success('Group image updated');
          },
          error: (err) => {
            this.alertSvc.error('Failed to update group image');
            console.error(err);
          }
        });
      }
    });
  }

  openAddMembersModal(): void {
    if (!this.isAdmin) {
      this.alertSvc.warning('Only admins can add members');
      return;
    }

    this.friendSvc.getFriendsList(this.currentUserId).subscribe({
      next: (data) => {
        const currentMemberIds = this.groupDetails?.members.map(m => m.userId) || [];
        this.friends = data.filter((f: any) => !currentMemberIds.includes(f.id));
        this.showAddMembersModal = true;
      },
      error: (err) => {
        this.alertSvc.error('Failed to load friends');
        console.error(err);
      }
    });
  }

  closeAddMembersModal(): void {
    this.showAddMembersModal = false;
    this.selectedFriends = [];
  }

  toggleFriendSelection(userId: string): void {
    const index = this.selectedFriends.indexOf(userId);
    if (index > -1) {
      this.selectedFriends.splice(index, 1);
    } else {
      this.selectedFriends.push(userId);
    }
  }

  isFriendSelected(userId: string): boolean {
    return this.selectedFriends.includes(userId);
  }

  addSelectedMembers(): void {
    if (this.selectedFriends.length === 0) {
      this.alertSvc.warning('Please select at least one member');
      return;
    }

    this.groupSvc.addMembers(this.groupId, this.selectedFriends).subscribe({
      next: (newMembers) => {
        this.alertSvc.success(`${newMembers.length} member(s) added`);
        newMembers.forEach((member:any) => {
          this.chatSvc.notifyMemberAdded(this.groupId, member);
        });
        this.loadGroupDetails();
        this.closeAddMembersModal();
      },
      error: (err) => {
        this.alertSvc.error('Failed to add members');
        console.error(err);
      }
    });
  }

  leaveGroup(): void {
    const me = this.groupDetails?.members.find(
      m => m.userId === this.currentUserId
    );

    if (!me) {
      this.alertSvc.error('You are not a member of this group');
      return;
    }
    this.removeMember(me);
  }

  removeMember(member: GroupMember): void {
    if (!this.isAdmin && member.userId !== this.currentUserId) {
      this.alertSvc.warning('Only admins can remove members');
      return;
    }

    const isRemovingSelf = member.userId === this.currentUserId;
    const title = isRemovingSelf ? 'Leave Group?' : `Remove ${member.userName}?`;
    const text = isRemovingSelf 
      ? 'You will no longer have access to this group'
      : 'This member will be removed from the group';

    Swal.fire({
      title: title,
      text: text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: isRemovingSelf ? 'Leave' : 'Remove',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      customClass: {
        popup: 'purple-gradient-popup'
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.groupSvc.removeMember(this.groupId, member.userId).subscribe({
          next: () => {
            this.chatSvc.notifyMemberRemoved(this.groupId, member.userId);
            if (isRemovingSelf) {
              this.alertSvc.success('You left the group');
              this.router.navigate(['/groups-list']);
            } else {
              this.alertSvc.success('Member removed');
              this.loadGroupDetails();
            }
          },
          error: (err) => {
            this.alertSvc.error('Failed to remove member');
            console.error(err);
          }
        });
      }
    });
  }

  makeAdmin(member: GroupMember): void {
    // This would require a backend endpoint to promote to admin
    this.alertSvc.info('This feature is coming soon');
  }

  getInitial(name: string): string {
    return name.charAt(0).toUpperCase();
  }

  getMemberCount(): number {
    return this.groupDetails?.members.length || 0;
  }
}