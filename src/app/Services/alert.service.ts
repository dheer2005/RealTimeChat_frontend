import { Injectable } from '@angular/core';
import Swal from 'sweetalert2';


@Injectable({
  providedIn: 'root'
})
export class AlertService {

  constructor() { }

  private Toast = Swal.mixin({
    toast: true,
    position: "top-end",
    showConfirmButton: false,
    timer: 2000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    }
  });

  success(message: string) {
    this.Toast.fire({
      icon: 'success',
      title: message
    });
  }

  error(message: string) {
    this.Toast.fire({
      icon: 'error',
      title: message
    });
  }

  warning(message: string) {
    this.Toast.fire({
      icon: 'warning',
      title: message
    });
  }

  info(message: string) {
    this.Toast.fire({
      icon: 'info',
      title: message
    });
  }

  confirm(title: string, text: string, confirmButtonText: string = 'Yes', cancelButtonText: string = 'No') {
    return Swal.fire({
      title: title,
      text: text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#10b981',
      cancelButtonColor: '#ef4444',
      confirmButtonText: confirmButtonText,
      cancelButtonText: cancelButtonText,
      background: '#ffffff',
      backdrop: 'rgba(0, 0, 0, 0.4)',
      customClass: {
        popup: 'modern-chat-alert',
        title: 'modern-chat-title',
        htmlContainer: 'modern-chat-text',
        confirmButton: 'modern-chat-confirm-btn',
        cancelButton: 'modern-chat-cancel-btn'
      },
      buttonsStyling: false,
      showClass: {
        popup: 'animate__animated animate__fadeInDown animate__faster'
      },
      hideClass: {
        popup: 'animate__animated animate__fadeOutUp animate__faster'
      }
    });
  }
}
