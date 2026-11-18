from django.http import JsonResponse
from clinicq.database.connection import db
from clinicq.api_helpers import get_current_user


def list_audit_logs(request):
    """Admin inspects immutable append-only audit records (newest first)."""
    user = get_current_user(request)
    if not user or user["role"] != "Admin":
        return JsonResponse({"error": "Access denied: Administrator required"}, status=403)

    cursor = db.audit_logs.find({}).sort("created_at", -1).limit(100)

    logs = []
    for l in cursor:
        u_email = "system@clinicq.local"
        if l.get("user_id"):
            u = db.users.find_one({"_id": l["user_id"]})
            if u:
                u_email = u["email"]

        created_dt = l.get("created_at")
        logs.append({
            "id": str(l["_id"]),
            "timestamp": created_dt.isoformat() if created_dt else "",
            "userId": str(l.get("user_id", "")),
            "userEmail": u_email,
            "action": l.get("action", ""),
            "targetType": l.get("target_type", ""),
            "targetId": str(l.get("target_id", "")),
            "details": l.get("details", "")
        })

    return JsonResponse({"auditLogs": logs})
