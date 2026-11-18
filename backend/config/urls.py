import os
from pathlib import Path
from django.urls import path, include, re_path
from django.http import HttpResponse, Http404
from django.conf import settings

FRONTEND_DIR = Path(settings.BASE_DIR).parent / 'frontend'


def serve_index(request):
    """Serve the single-page frontend application."""
    index_file = FRONTEND_DIR / 'index.html'
    if index_file.exists():
        with open(index_file, 'r', encoding='utf-8') as f:
            return HttpResponse(f.read(), content_type='text/html; charset=utf-8')
    return HttpResponse("Frontend index.html not found", status=404)


def serve_frontend_static(request, filename):
    """Serve frontend static files (css, js, assets)."""
    file_path = FRONTEND_DIR / filename
    if file_path.exists() and file_path.is_file():
        content_type = 'text/plain'
        if filename.endswith('.css'):
            content_type = 'text/css; charset=utf-8'
        elif filename.endswith('.js'):
            content_type = 'application/javascript; charset=utf-8'
        elif filename.endswith('.html'):
            content_type = 'text/html; charset=utf-8'

        with open(file_path, 'r', encoding='utf-8') as f:
            return HttpResponse(f.read(), content_type=content_type)
    raise Http404("File not found")


urlpatterns = [
    # REST API Endpoints
    path('api/auth/', include('accounts.urls')),
    path('api/clinic/', include('clinic.urls')),
    path('api/booking/', include('booking.urls')),
    path('api/notes/', include('notes.urls')),
    path('api/audit/', include('audit.urls')),

    # Frontend integration
    path('', serve_index, name='index'),
    path('style.css', lambda r: serve_frontend_static(r, 'style.css')),
    path('app.js', lambda r: serve_frontend_static(r, 'app.js')),
    path('data.js', lambda r: serve_frontend_static(r, 'data.js')),
]
