import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-profile-description',
  standalone: true,
  imports: [],
  templateUrl: './profile-description.component.html',
  styleUrl: './profile-description.component.css'
})
export class ProfileDescriptionComponent {

  profileName = '';

  constructor(private activatedRoute: ActivatedRoute, private Router: Router){
    this.activatedRoute.paramMap.subscribe(param=>{
      this.profileName = param.get('name')?? '';
    })
  }

}
