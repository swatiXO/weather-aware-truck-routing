import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { api, type ApiError } from "../api/client";
import type { Checkpoint, Plan, PlanRequest } from "../api/types";

/** A checkpoint hovered in the table or on the map; `from` says which, so only the other side reacts. */
export interface Highlight {
  mile: number;
  from: "map" | "list";
}

/** Trip planning state: the request, the current plan, which route is selected, and the heatmap. */
export function usePlanner() {
  // Kept separately from the mutation so a failed re-plan (e.g. a typo) doesn't wipe the last good results.
  const [plan, setPlan] = useState<Plan | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focused, setFocused] = useState<Checkpoint | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [editing, setEditing] = useState(true);

  const mutation = useMutation({
    mutationFn: (req: PlanRequest) => api.plan(req),
    onSuccess: (next) => {
      setPlan(next);
      setSelectedId(next.recommended_route_id ?? next.routes[0]?.id ?? null);
      setFocused(null);
      setHighlight(null);
      setEditing(false);
    },
  });

  // The heatmap is heavier, so it loads after the routes are already on screen.
  const heatmap = useQuery({
    queryKey: ["heatmap", plan?.plan_id],
    queryFn: () => api.heatmap(plan!.plan_id),
    enabled: !!plan,
    staleTime: Infinity,
    // A burst of trips can hit Open-Meteo's per-minute limit; waiting usually clears it.
    retry: 2,
    retryDelay: 20_000,
  });

  const selectRoute = (id: string) => {
    setSelectedId(id);
    setHighlight(null);
  };

  return {
    plan,
    selected: plan?.routes.find((r) => r.id === selectedId) ?? null,
    selectRoute,
    heatmap,
    submit: mutation.mutate,
    pending: mutation.isPending,
    error: mutation.error as ApiError | null,
    editing: editing || !plan,
    setEditing,
    focused,
    setFocused,
    highlight,
    setHighlight,
  };
}
