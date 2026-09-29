#!/usr/bin/env python3
"""Host-side brrr alerts. Cooldown JSON matches src/lib/alert.ts."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

SEND_URL = "https://api.brrr.now/v1/send"
SECRET_RE = re.compile(r"^br_[a-z0-9]+_[A-Za-z0-9]+$", re.I)
COOLDOWN_MS = 15 * 60 * 1000
SSD_LOW_GB = 5.0


def parse_webhook(raw: str):
    v = (raw or "").strip()
    if not v:
        return None
    if SECRET_RE.match(v):
        return v
    try:
        from urllib.parse import urlparse

        u = urlparse(v)
    except Exception:
        return None
    if u.scheme != "https" or u.hostname != "api.brrr.now" or u.port or u.username:
        return None
    m = re.match(r"^/v1/(br_[a-z0-9]+_[A-Za-z0-9]+)$", u.path or "", re.I)
    return m.group(1) if m else None


def load_json(path: str, default):
    try:
        with open(path) as f:
            data = json.load(f)
        return data if isinstance(data, dict) else default
    except Exception:
        return default


def atomic_write(path: str, payload: dict):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(payload, f)
        f.write("\n")
    os.replace(tmp, path)
    try:
        os.chmod(path, 0o600)
    except Exception:
        pass


def read_webhook(root: str) -> str:
    settings = load_json(os.path.join(root, "data", "settings.json"), {})
    url = str(settings.get("BRRR_WEBHOOK_URL") or "").strip()
    if url:
        return url
    env_path = os.path.join(root, ".env")
    try:
        with open(env_path) as f:
            for line in f:
                m = re.match(r"^BRRR_WEBHOOK_URL=(.*)$", line.strip())
                if m:
                    return m.group(1).strip().strip('"').strip("'")
    except Exception:
        pass
    return os.environ.get("BRRR_WEBHOOK_URL", "")


def decide_host_alerts(
    *,
    replica_configured: bool,
    container_running: bool,
    host_mounted: bool,
    container_reachable: bool,
    mac_free_gb,
    ssd_free_gb,
    mac_low_threshold_gb: float,
    recreate_failed: bool,
):
    alerts = []
    ssd_thread = "crowdsnap-ssd"
    web_thread = "crowdsnap-web"
    disk_thread = "crowdsnap-storage"

    if replica_configured:
        if not host_mounted:
            alerts.append(
                {
                    "key": "ssd.unplugged",
                    "title": "Backup SSD unplugged",
                    "message": "The replica drive is not mounted. Uploads stay on the Mac until it is plugged back in.",
                    "level": "critical",
                    "threadId": ssd_thread,
                }
            )
        else:
            alerts.append(
                {
                    "key": "ssd.unplugged",
                    "title": "Backup SSD unplugged",
                    "message": "The replica drive is mounted again.",
                    "level": "critical",
                    "threadId": ssd_thread,
                    "recovered": True,
                }
            )

        if host_mounted and container_running and not container_reachable:
            alerts.append(
                {
                    "key": "ssd.bind_stale",
                    "title": "SSD bind stale",
                    "message": "The Mac has the drive, but Docker cannot write it. The watcher will recreate the web container.",
                    "level": "time-sensitive",
                    "threadId": ssd_thread,
                }
            )
        elif container_reachable:
            alerts.append(
                {
                    "key": "ssd.bind_stale",
                    "title": "SSD bind stale",
                    "message": "Docker can write the replica again.",
                    "level": "time-sensitive",
                    "threadId": ssd_thread,
                    "recovered": True,
                }
            )

    if recreate_failed:
        alerts.append(
            {
                "key": "ssd.recreate_failed",
                "title": "SSD remount failed",
                "message": "docker compose could not recreate the web container with the SSD overlay.",
                "level": "critical",
                "threadId": ssd_thread,
            }
        )

    if not container_running:
        alerts.append(
            {
                "key": "web.down",
                "title": "CrowdSnap web is down",
                "message": "The wedding-web container is not running. Guest uploads will fail until it is back.",
                "level": "critical",
                "threadId": web_thread,
            }
        )
    else:
        alerts.append(
            {
                "key": "web.down",
                "title": "CrowdSnap web is down",
                "message": "The web container is running again.",
                "level": "critical",
                "threadId": web_thread,
                "recovered": True,
            }
        )

    if mac_free_gb is not None and mac_free_gb < mac_low_threshold_gb:
        alerts.append(
            {
                "key": "disk.mac_low",
                "title": "Mac disk critically low",
                "message": f"Only {mac_free_gb:.1f} GB free on the Mac (threshold {mac_low_threshold_gb:g} GB).",
                "level": "critical",
                "threadId": disk_thread,
            }
        )
    elif mac_free_gb is not None:
        alerts.append(
            {
                "key": "disk.mac_low",
                "title": "Mac disk critically low",
                "message": f"Mac disk has {mac_free_gb:.1f} GB free.",
                "level": "critical",
                "threadId": disk_thread,
                "recovered": True,
            }
        )

    if ssd_free_gb is not None and ssd_free_gb < SSD_LOW_GB:
        alerts.append(
            {
                "key": "disk.ssd_low",
                "title": "Backup SSD disk low",
                "message": f"Only {ssd_free_gb:.1f} GB free on the replica SSD.",
                "level": "time-sensitive",
                "threadId": disk_thread,
            }
        )
    elif ssd_free_gb is not None:
        alerts.append(
            {
                "key": "disk.ssd_low",
                "title": "Backup SSD disk low",
                "message": f"Replica SSD has {ssd_free_gb:.1f} GB free.",
                "level": "time-sensitive",
                "threadId": disk_thread,
                "recovered": True,
            }
        )

    return alerts


def decide_action(state: dict, key: str, now_ms: int, recovered: bool):
    prev = state.get(key)
    if recovered:
        return "recover" if prev and prev.get("open") else "skip"
    if not prev or not prev.get("open"):
        return "send"
    if now_ms - int(prev.get("lastSentAt") or 0) < COOLDOWN_MS:
        return "skip"
    return "send"


def send_one(root: str, alert: dict, *, force: bool = False) -> str:
    secret = parse_webhook(read_webhook(root))
    if not secret:
        return "noop"

    cooldown_path = os.path.join(root, "data", "alert-cooldown.json")
    state = load_json(cooldown_path, {})
    now_ms = int(time.time() * 1000)
    recovered = bool(alert.get("recovered"))
    action = "send" if force and not recovered else ("recover" if force and recovered else decide_action(state, alert["key"], now_ms, recovered))
    if force and recovered:
        action = "recover"
    elif force:
        action = "send"
    if action == "skip":
        return "skipped"

    level = alert.get("level") or ("active" if recovered else "critical")
    title = alert["title"]
    message = alert["message"]
    if action == "recover":
        title = f"Recovered: {title}"
        message = f"{message} — this is now resolved."
        level = "active"
        sound = "bubbly_success_ding"
    else:
        sound = "emergency" if level == "critical" else "upbeat_bells"

    body = {
        "title": title,
        "message": message,
        "thread_id": alert.get("threadId") or f"crowdsnap-{alert['key'].split('.')[0]}",
        "interruption_level": level,
        "sound": sound,
    }
    if level == "critical" and action != "recover":
        body["volume"] = 1

    settings = load_json(os.path.join(root, "data", "settings.json"), {})
    public = str(settings.get("NEXTAUTH_URL") or "").rstrip("/")
    if public:
        body["open_url"] = public + "/admin"

    req = urllib.request.Request(
        SEND_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {secret}",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status < 200 or resp.status >= 300:
                return "failed"
    except (urllib.error.URLError, TimeoutError, OSError):
        return "failed"

    state[alert["key"]] = {"lastSentAt": now_ms, "open": action != "recover"}
    try:
        atomic_write(cooldown_path, state)
    except Exception:
        pass
    return "recovered" if action == "recover" else "sent"


def as_bool(v: str) -> bool:
    return str(v).lower() in ("1", "true", "yes")


def as_float(v):
    if v is None or v == "" or str(v).lower() == "none":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def cmd_eval_host(args):
    root = args.root
    status = load_json(os.path.join(root, "data", "ssd-status.json"), {})
    settings = load_json(os.path.join(root, "data", "settings.json"), {})
    replica = str(status.get("replicaPath") or settings.get("STORAGE_REPLICA_PATH") or "").strip()
    replica_configured = bool(replica)
    if args.replica_configured is not None:
        replica_configured = as_bool(args.replica_configured)
    mac_low = as_float(settings.get("STORAGE_OVERFLOW_FREE_GB"))
    if mac_low is None:
        mac_low = 10.0
    if args.mac_low is not None:
        parsed = as_float(args.mac_low)
        if parsed is not None:
            mac_low = parsed

    alerts = decide_host_alerts(
        replica_configured=replica_configured,
        container_running=as_bool(args.container_running),
        host_mounted=bool(status.get("hostMounted")) if args.host_mounted is None else as_bool(args.host_mounted),
        container_reachable=bool(status.get("containerReachable"))
        if args.container_reachable is None
        else as_bool(args.container_reachable),
        mac_free_gb=as_float(args.mac_free),
        ssd_free_gb=as_float(args.ssd_free),
        mac_low_threshold_gb=mac_low,
        recreate_failed=as_bool(args.recreate_failed),
    )
    for alert in alerts:
        result = send_one(root, alert)
        if result in ("sent", "recovered", "failed"):
            print(f"brrr {result} {alert['key']}", file=sys.stderr)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd", required=True)

    ev = sub.add_parser("eval-host")
    ev.add_argument("--root", required=True)
    ev.add_argument("--container-running", required=True)
    ev.add_argument("--recreate-failed", default="false")
    ev.add_argument("--mac-free", default=None)
    ev.add_argument("--ssd-free", default=None)
    ev.add_argument("--mac-low", default=None)
    ev.add_argument("--host-mounted", default=None)
    ev.add_argument("--container-reachable", default=None)
    ev.add_argument("--replica-configured", default=None)

    se = sub.add_parser("send")
    se.add_argument("--root", required=True)
    se.add_argument("--key", required=True)
    se.add_argument("--title", required=True)
    se.add_argument("--message", required=True)
    se.add_argument("--level", default="critical")
    se.add_argument("--thread", default=None)
    se.add_argument("--recovered", action="store_true")
    se.add_argument("--force", action="store_true")

    args = parser.parse_args()
    if args.cmd == "eval-host":
        cmd_eval_host(args)
        return
    result = send_one(
        args.root,
        {
            "key": args.key,
            "title": args.title,
            "message": args.message,
            "level": args.level,
            "threadId": args.thread,
            "recovered": args.recovered,
        },
        force=args.force,
    )
    if result in ("sent", "recovered", "failed"):
        print(f"brrr {result} {args.key}", file=sys.stderr)
    sys.exit(0 if result != "failed" else 1)


if __name__ == "__main__":
    main()
