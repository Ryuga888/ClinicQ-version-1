from django.urls import path
from notes import views

urlpatterns = [
    path('<str:appointment_id>', views.handle_note, name='handle_note'),
]
