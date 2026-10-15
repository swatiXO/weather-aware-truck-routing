import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_list(name: str, default: str = "") -> list[str]:
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "dev-only-insecure-key")
DEBUG = os.environ.get("DJANGO_DEBUG", "false").lower() == "true"
ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "corsheaders",
    "rest_framework",
    "planner",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

# No models: the app is stateless apart from the cache.
DATABASES = {}

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
        "OPTIONS": {"MAX_ENTRIES": 20_000},
    }
}

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
    "UNAUTHENTICATED_USER": None,
    # Per-IP limits. Every plan spends OpenRouteService and Open-Meteo quota that all
    # visitors share, so one busy client shouldn't be able to take the app down.
    "DEFAULT_THROTTLE_RATES": {"plan_burst": "6/min", "plan_hour": "30/hour", "heatmap": "60/hour"},
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:5173")
CORS_ALLOWED_ORIGIN_REGEXES = env_list("CORS_ALLOWED_ORIGIN_REGEXES")

USE_TZ = True
TIME_ZONE = "UTC"

ORS_API_KEY = os.environ.get("ORS_API_KEY", "")
ORS_BASE_URL = "https://api.openrouteservice.org"
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
HTTP_TIMEOUT_S = 20

LOGGING = {
    "version": 1,
    "handlers": {"console": {"class": "logging.StreamHandler"}},
    "root": {"handlers": ["console"], "level": "INFO"},
}
