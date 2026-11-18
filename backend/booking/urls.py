from django.urls import path
from booking import views

urlpatterns = [
    path('book', views.book_appointment, name='book_appointment'),
    path('patient', views.patient_appointments, name='patient_appointments'),
    path('<str:appointment_id>/cancel', views.cancel_appointment, name='cancel_appointment'),
    path('doctor', views.doctor_schedule, name='doctor_schedule'),
    path('<str:appointment_id>/complete', views.complete_appointment, name='complete_appointment'),
    path('admin', views.admin_appointments, name='admin_appointments'),
]
