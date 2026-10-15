from django.conf import settings
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .pipeline import build_heatmap, build_plan
from .serializers import PlanRequestSerializer
from .services.http import UpstreamError


# Rates live in settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"].
class PlanBurstThrottle(AnonRateThrottle):
    scope = "plan_burst"


class PlanHourThrottle(AnonRateThrottle):
    scope = "plan_hour"


class HeatmapThrottle(AnonRateThrottle):
    scope = "heatmap"


class HealthView(APIView):
    def get(self, request):
        return Response({"ok": True, "routing_configured": bool(settings.ORS_API_KEY)})


class PlanView(APIView):
    throttle_classes = [PlanBurstThrottle, PlanHourThrottle]

    def post(self, request):
        req = PlanRequestSerializer(data=request.data)
        if not req.is_valid():
            return Response({"error": "Invalid request.", "fields": req.errors}, status=400)
        d = req.validated_data
        try:
            plan = build_plan(d["origin"], d["destination"], d["departure"], d["load_lb"],
                              d["interval_mi"], d["hos_breaks"])
        except UpstreamError as exc:
            return Response({"error": exc.message}, status=exc.status)
        return Response(plan)


class HeatmapView(APIView):
    throttle_classes = [HeatmapThrottle]

    def get(self, request, plan_id: str):
        try:
            heatmap = build_heatmap(plan_id)
        except UpstreamError as exc:
            return Response({"error": exc.message}, status=exc.status)
        if heatmap is None:
            return Response({"error": "Plan expired. Please plan the trip again."}, status=404)
        return Response(heatmap)
