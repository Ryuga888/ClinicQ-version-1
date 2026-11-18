from django.urls import path
from clinic import views

urlpatterns = [
    path('doctors', views.list_doctors, name='list_doctors'),
    path('doctors/create', views.create_doctor, name='create_doctor'),
    path('doctors/<str:doctor_id>/update', views.update_doctor, name='update_doctor'),
    path('slots', views.list_slots, name='list_slots'),
    path('slots/generate', views.generate_slots, name='generate_slots'),
    path('slots/<str:slot_id>', views.remove_slot, name='remove_slot'),
]
