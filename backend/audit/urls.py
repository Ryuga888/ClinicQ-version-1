from django.urls import path
from audit import views

urlpatterns = [
    path('', views.list_audit_logs, name='list_audit_logs'),
]
