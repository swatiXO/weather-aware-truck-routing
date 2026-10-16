from datetime import datetime, timedelta, timezone

from rest_framework import serializers

MAX_DEPARTURE_AHEAD = timedelta(days=14)
DEPARTURE_GRACE = timedelta(hours=1)


class PlanRequestSerializer(serializers.Serializer):
    origin = serializers.CharField(max_length=200, trim_whitespace=True)
    destination = serializers.CharField(max_length=200, trim_whitespace=True)
    departure = serializers.DateTimeField()
    load_lb = serializers.FloatField(min_value=1, max_value=80_000)
    interval_mi = serializers.ChoiceField(choices=[10, 25, 50], default=25)
    hos_breaks = serializers.BooleanField(default=True)

    def validate_departure(self, value: datetime) -> datetime:
        # DRF has already made this timezone-aware; a time sent without an offset is read as UTC.
        now = datetime.now(timezone.utc)
        if value < now - DEPARTURE_GRACE:
            raise serializers.ValidationError("Departure can't be in the past.")
        if value > now + MAX_DEPARTURE_AHEAD:
            raise serializers.ValidationError("Departure must be within 14 days (forecast limit).")
        return value
