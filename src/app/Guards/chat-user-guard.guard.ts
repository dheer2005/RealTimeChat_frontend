import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthenticationService } from '../Services/authentication.service';
import { ToastrService } from 'ngx-toastr';
import { ChatService } from '../Services/chat.service';
import { Location } from '@angular/common';
import { firstValueFrom, map } from 'rxjs';
import { FriendrequestService } from '../Services/friendrequest.service';

export const chatUserGuardGuard: CanActivateFn = (route, state) => {
  const authSvc = inject(AuthenticationService);
  const toastr = inject(ToastrService);
  const router = inject(Router);
  const chatSvc = inject(ChatService);
  const friendRequestSvc = inject(FriendrequestService);
  const location = inject(Location);

  const loggedInUser = authSvc.getUserName();
  const targetUser = route.paramMap.get('name');


  if(loggedInUser && targetUser && loggedInUser.toLowerCase() === targetUser.toLowerCase()){
    toastr.error("You cannot chat with yourself");
    location.back();
  }

  try{
    const friends = firstValueFrom(friendRequestSvc.getFriendsList(authSvc.getUserId()).pipe(
      map((friendsList:any) => friendsList.map((f: any) => f.userName.toLowerCase()))
    ));

    const isFriend = friends.then((list:any) => list.includes(targetUser?.toLowerCase() || ''));

    if (!isFriend) {
      toastr.warning('You can only chat with your friends!');
      return router.parseUrl('/home');
    }
  }
  catch(err){
    toastr.error('Unable to verify chat access.');
    return router.parseUrl('/home');
  }
  return true;
};
