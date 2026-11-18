import time
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from clinicq.database.connection import db
from clinicq.database.schemas import user_document
from clinicq.api_helpers import (
    hash_password,
    verify_password,
    get_current_user,
    log_audit,
    parse_json
)

# In-memory failed login tracking for lockout
FAILED_LOGINS = {}  # { email: { 'count': int, 'last_time': float } }


@csrf_exempt
def register_patient(request):
    """Patient self-registration."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    data = parse_json(request)
    name = data.get("name", "").strip()
    email = data.get("email", "").strip().lower()
    phone = data.get("phone", "").strip()
    password = data.get("password", "")

    if not name or not email or not phone or not password:
        return JsonResponse({"error": "All fields are required"}, status=400)

    # Check unique email
    if db.users.find_one({"email": email}):
        return JsonResponse({"error": "An account with this email address already exists."}, status=409)

    pwd_hash = hash_password(password)
    user_doc = user_document(name, email, phone, pwd_hash, "Patient")

    result = db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Audit log
    log_audit(user_id, "USER_REGISTRATION", "USER", user_id, f"Patient {name} self-registered with email {email}")

    # Set session
    request.session['user_id'] = user_id
    request.session['role'] = "Patient"

    return JsonResponse({
        "user": {
            "id": user_id,
            "name": name,
            "email": email,
            "phone": phone,
            "role": "Patient"
        }
    }, status=201)


@csrf_exempt
def login_view(request):
    """User authentication with Argon2 and generic failure response."""
    if request.method != 'POST':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    data = parse_json(request)
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    now = time.time()
    failed = FAILED_LOGINS.get(email)

    # Lockout: 5 failed attempts in 10 minutes locks account for 10 minutes
    if failed and failed['count'] >= 5:
        if (now - failed['last_time']) < 600:
            remaining_mins = int((600 - (now - failed['last_time'])) / 60) + 1
            return JsonResponse({
                "error": f"Account temporarily locked due to consecutive failed attempts. Please wait {remaining_mins} minute(s)."
            }, status=429)
        else:
            # Lockout expired
            FAILED_LOGINS.pop(email, None)

    user = db.users.find_one({"email": email})
    if not user or not verify_password(user["password_hash"], password):
        # Record failed attempt
        if email not in FAILED_LOGINS:
            FAILED_LOGINS[email] = {'count': 1, 'last_time': now}
        else:
            FAILED_LOGINS[email]['count'] += 1
            FAILED_LOGINS[email]['last_time'] = now

        log_audit(None, "LOGIN_FAILED", "USER", email, "Failed authentication attempt.")
        # Single generic error message
        return JsonResponse({"error": "Invalid email or password."}, status=401)

    # Successful login: reset failed counter
    FAILED_LOGINS.pop(email, None)

    user_id = str(user["_id"])
    role = user["role"]

    request.session['user_id'] = user_id
    request.session['role'] = role

    log_audit(user_id, "LOGIN_SUCCESS", "USER", user_id, f"User {user['name']} signed in with role {role}")

    return JsonResponse({
        "user": {
            "id": user_id,
            "name": user["name"],
            "email": user["email"],
            "phone": user.get("phone", ""),
            "role": role
        }
    })


@csrf_exempt
def logout_view(request):
    """User session termination."""
    user = get_current_user(request)
    if user:
        log_audit(user["id"], "LOGOUT", "USER", user["id"], f"User {user['name']} explicitly logged out.")

    request.session.flush()
    return JsonResponse({"success": True})


def me_view(request):
    """Get current session user details."""
    user = get_current_user(request)
    return JsonResponse({"user": user})
