"""Phase 6 sidecar throughput/latency benchmark.

Run against a live sidecar (default http://127.0.0.1:8787):
    uv run python scripts/bench_sidecar.py
Records real numbers for docs/benchmarks.md. Read-only endpoints only.
"""
import asyncio
import statistics
import sys
import time

import httpx

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787"
CONCURRENCY = 8
DURATION_S = 5.0

ENDPOINTS = [
    ("/capabilities", "GET"),
    ("/graph", "GET"),
    ("/topics/t/robot1/cmd_vel/samples", "GET"),
    ("/repos/networkintel/topology", "GET"),
    ("/repos/syncfleet/status", "GET"),
]


async def hammer(client: httpx.AsyncClient, method: str, path: str, stop_at: float, lat: list[float], errors: list[int]) -> None:
    while time.monotonic() < stop_at:
        t0 = time.perf_counter()
        try:
            r = await client.request(method, path)
            if r.status_code != 200:
                errors.append(0)
        except Exception:
            errors.append(0)
        lat.append(time.perf_counter() - t0)


async def bench(client: httpx.AsyncClient, path: str, method: str) -> dict:
    lat: list[float] = []
    errors: list[int] = []
    stop_at = time.monotonic() + DURATION_S
    async with asyncio.TaskGroup() as tg:
        for _ in range(CONCURRENCY):
            tg.create_task(hammer(client, method, path, stop_at, lat, errors))
    lat.sort()
    n = len(lat)
    pct = lambda p: lat[min(n - 1, int(n * p))] * 1000
    return {
        "path": path,
        "rps": round(n / DURATION_S, 1),
        "p50_ms": round(pct(0.50), 2),
        "p95_ms": round(pct(0.95), 2),
        "p99_ms": round(pct(0.99), 2),
        "errors": len(errors),
    }


async def main() -> None:
    async with httpx.AsyncClient(base_url=BASE, timeout=10) as client:
        print(f"sidecar benchmark: {BASE} concurrency={CONCURRENCY} duration={DURATION_S}s")
        print(f"{'endpoint':<40} {'rps':>8} {'p50':>8} {'p95':>8} {'p99':>8} {'errors':>7}")
        for path, method in ENDPOINTS:
            r = await bench(client, path, method)
            print(f"{r['path']:<40} {r['rps']:>8} {r['p50_ms']:>8} {r['p95_ms']:>8} {r['p99_ms']:>8} {r['errors']:>7}")


if __name__ == "__main__":
    asyncio.run(main())
