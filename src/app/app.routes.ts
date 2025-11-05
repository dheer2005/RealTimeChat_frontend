import { Routes } from '@angular/router';
import { LoginComponent } from './Authentication/login/login.component';
import { RegisterComponent } from './Authentication/register/register.component';
import { HomeComponent } from './home/home.component';
import { ChatComponent } from './chat-component/chat-component.component';
import { authGuard } from './Guards/auth.guard';
import { ProfileDescriptionComponent } from './profile-description/profile-description.component';
import { GroupChatComponent } from './group-chat/group-chat.component';
import { chatUserGuardGuard } from './Guards/chat-user-guard.guard';

export const routes: Routes = [
    { path: 'login', component: LoginComponent },
    { path: 'register', component: RegisterComponent },
    { path:'home', component: HomeComponent, canActivate: [authGuard] },
    { path: 'group-chat', component: GroupChatComponent, canActivate: [authGuard] },
    { path: 'chats', component: ChatComponent, canActivate: [authGuard] },
    { path: 'chats/:name', component: ChatComponent, canActivate: [authGuard, chatUserGuardGuard] },
    { path: 'profile', component: ProfileDescriptionComponent, canActivate: [authGuard] },
    { path: 'profile/:name', component: ProfileDescriptionComponent, canActivate: [authGuard] },
    { path: 'friend-request', loadComponent: () => import('./friend-request/friend-request.component').then(m => m.FriendRequestComponent), canActivate: [authGuard] },
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: '**', redirectTo: 'login', pathMatch: 'full' }
];
