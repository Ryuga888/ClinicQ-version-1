import json
from functools import wraps
from django.http import JsonResponse
from bson import ObjectId
from clinicq.database.connection import db
from clinicq.database.schemas import audit_log_document
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# Tuned parameters for standard Windows memory constraints (RFC 9106 compliant)
ph = PasswordHasher(time_cost=1, memory_cost=1024, parallelism=1)


def hash_password(password: str) -> str:
    """Hash password using Argon2."""
    return ph.hash(password)


def verify_password(hashed: str, password: str) -> bool:
    """Verify password against Argon2 hash."""
    try:
        return ph.verify(hashed, password)
    except Exception:
        return False


def get_current_user(request):
    """Retrieve the currently authenticated user from session."""
    user_id = request.session.get('user_id')
    if not user_id:
        return None
    try:
        user = db.users.find_one({"_id": ObjectId(user_id)})
        if user:
            return {
                "id": str(user["_id"]),
                "name": user["name"],
                "email": user["email"],
                "phone": user.get("phone", ""),
                "role": user["role"]
            }
    except Exception:
        pass
    return None


def require_role(roles):
    """Decorator to enforce role-based access control."""
    if isinstance(roles, str):
        roles = [roles]

    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            user = get_current_user(request)
            if not user:
                return JsonResponse({"error": "Authentication required"}, status=401)
            if user["role"] not in roles:
                return JsonResponse({"error": "Access denied: insufficient permissions"}, status=403)
            request.current_user = user
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


def log_audit(user_id, action, target_type, target_id, details=""):
    """Append-only audit log entry."""
    try:
        u_id = ObjectId(user_id) if user_id and ObjectId.is_valid(str(user_id)) else None
        doc = audit_log_document(
            user_id=u_id,
            action=action,
            target_type=target_type,
            target_id=str(target_id)
        )
        if details:
            doc["details"] = str(details)
        db.audit_logs.insert_one(doc)
    except Exception as e:
        print(f"Audit log failed: {e}")


def parse_json(request):
    """Parse JSON body from request."""
    if not request.body:
        return {}
    try:
        return json.loads(request.body.decode('utf-8'))
    except Exception:
        return {}
