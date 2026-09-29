import { Metadata } from "next";
import TelemetryDashboard from "./TelemetryDashboard";

export const metadata: Metadata = {
  title: "Telemetry & Storage Operations | CrowdSnap Admin",
  description: "Live bandwidth, ingestion queues, disk capacity, and fail-safe redundancy monitoring.",
};

export default function TelemetryPage() {
  return <TelemetryDashboard />;
}
