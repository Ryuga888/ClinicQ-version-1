from django.urls import path
from accounts import views

urlpatterns = [
    path('register', views.register_patient, name='register_patient'),
    path('login', views.login_view, name='login_view'),
    path('logout', views.logout_view, name='logout_view'),
    path('me', views.me_view, name='me_view'),
]
