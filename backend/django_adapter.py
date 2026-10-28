"""Optional Django view reference for embedding a read-only CYRUS status endpoint.

Install Django separately when using this adapter. The FastAPI application remains the
canonical orchestration API. Add this view to a Django URL configuration if needed.
"""
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def cyrus_health(request):
    return JsonResponse({
        "status": "ok",
        "service": "cyrus-django-adapter",
        "canonical_api": "FastAPI",
        "note": "Use the canonical FastAPI service for persistent workflow runs.",
    })
