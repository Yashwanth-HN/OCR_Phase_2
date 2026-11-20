"""Shared limits for the CPU-heavy model work (CRNN recognition and speech synthesis).

MODEL_LOCK: only one model call runs at a time. Each call needs a few hundred MB on top of the ~0.5 GB the
loaded models take (an OCR batch of 16 crops ~0.3 GB, a long TTS sentence ~0.55 GB). With separate locks an OCR
request and a TTS request could overlap; on a 2 GB container that ran out of memory and the container was killed
(502 from the gateway). One lock keeps the peak at the larger of the two instead of their sum. Calls are short
(one OCR batch, one TTS sentence), so requests interleave rather than wait for each other's whole job.
"""
from __future__ import annotations

import os
import threading
from pathlib import Path

MODEL_LOCK = threading.Lock()


def memory_mb() -> dict[str, int]:
    """Memory of this process and its container in MB (Linux only; empty elsewhere), reported by /health so a
    deployment can be checked from outside: rss = now, peak_rss = highest so far, container = cgroup total."""
    out: dict[str, int] = {}
    try:
        for line in Path("/proc/self/status").read_text().splitlines():
            if line.startswith("VmRSS:"):
                out["rss"] = int(line.split()[1]) // 1024
            elif line.startswith("VmHWM:"):
                out["peak_rss"] = int(line.split()[1]) // 1024
    except (OSError, ValueError, IndexError):
        pass
    try:
        out["container"] = int(Path("/sys/fs/cgroup/memory.current").read_text()) // 2**20
        limit = Path("/sys/fs/cgroup/memory.max").read_text().strip()
        if limit != "max":
            out["container_limit"] = int(limit) // 2**20
    except (OSError, ValueError):
        pass
    return out


def cpu_limit() -> int:
    """CPUs this process may use: the container's CPU quota (cgroup v2 cpu.max, or v1 cfs quota) when one is set,
    else all cores. os.cpu_count() reports the host's cores, so in a 1-vCPU container it would make PyTorch start
    many threads that only compete for that one CPU."""
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()[:2]
        if quota != "max":
            return max(1, round(int(quota) / int(period)))
    except (OSError, ValueError):
        pass
    try:
        quota_us = int(Path("/sys/fs/cgroup/cpu/cpu.cfs_quota_us").read_text())
        period_us = int(Path("/sys/fs/cgroup/cpu/cpu.cfs_period_us").read_text())
        if quota_us > 0:
            return max(1, round(quota_us / period_us))
    except (OSError, ValueError):
        pass
    return os.cpu_count() or 1
