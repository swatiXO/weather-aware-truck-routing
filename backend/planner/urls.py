from django.urls import path

from .views import HealthView, HeatmapView, PlanView

urlpatterns = [
    path("health", HealthView.as_view()),
    path("plan", PlanView.as_view()),
    path("heatmap/<str:plan_id>", HeatmapView.as_view()),
]
