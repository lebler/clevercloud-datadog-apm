# Datadog APM on Clever Cloud

A working reference for running **Datadog APM** on [Clever Cloud](https://www.clever.cloud/):
a buildpack application instrumented with `dd-trace` sends traces to a **self-hosted Datadog
Agent** (a separate Docker application), with the two communicating over a Clever Cloud
**Network Group** (managed WireGuard private network).

Validated end-to-end: Express app → Agent → Datadog, traces + Error Tracking confirmed.

```
┌─────────────────────────┐        traces :8080         ┌──────────────────────────┐
│  App (buildpack)         │ ──────────────────────────▶ │  Datadog Agent (Docker)   │ ──▶ Datadog
│  dd-trace                │      over Network Group       │  APM receiver on :8080     │
│  10.101.0.x (wg)         │      (private 10.101.0.0/16)  │  10.101.0.y (wg)           │
└─────────────────────────┘                               └──────────────────────────┘
```

## Repo layout

| Path | What |
|---|---|
| [`app/`](app/) | Minimal Express app, instrumented with the basic `dd-trace` init. Includes a stdout logger that injects the active span's `trace_id`/`span_id` (handy for proving the tracer is live). |
| [`agent/Dockerfile`](agent/Dockerfile) | The Datadog Agent as a Clever Cloud Docker app, trimmed to APM and tuned for Clever Cloud. |

## Why this is non-obvious (the 5 things that matter)

1. **Disable the image healthcheck.** The stock `datadog/agent` image runs `agent health` on
   a Docker `HEALTHCHECK` timer; on a small instance those calls hang and pile up until they
   starve CPU and the agent never starts. → `HEALTHCHECK NONE`.
2. **Set `DD_HOSTNAME`.** Clever Cloud containers have no cloud metadata, so the agent can't
   derive a hostname and crash-loops without it.
3. **Keep the default exposed port → host networking.** Clever Cloud picks the Docker network
   mode from the port config: the **default port (8080) runs `--net host`** (reachable on the
   Network Group); **any custom `CC_DOCKER_EXPOSED_HTTP_PORT` forces Docker bridge mode**
   (`172.17.x`, isolated from the NG). So leave the port default and put the **APM receiver on
   8080** (`DD_APM_RECEIVER_PORT=8080`) so the trace endpoint also answers the health check.
4. **Create the Network Group in the web console, not the CLI.** A CLI-created NG links
   members but instances never become peers (`Peers: 0`, no WireGuard interface). A
   console-created NG peers correctly. (The CLI and console use different NG backends.)
5. **Address the agent by its NG hostname**, never the raw `10.101.x.x` IP:
   `http://<agentAppId>.m.<ngId>.cc-ng.cloud:8080`. Copy the exact value from the console
   **Members and peers** tab; a stale `<ngId>` yields `ENOTFOUND`.

## Deploy

### 1. Agent (Docker app)
Deploy [`agent/Dockerfile`](agent/Dockerfile) as a Clever Cloud **Docker** application.
- Set `DD_API_KEY` in the console (never commit it). `DD_SITE` defaults to US1
  (`datadoghq.com`); set it for other sites.
- **Do not set a custom `CC_DOCKER_EXPOSED_HTTP_PORT`** — keep the default so the container
  runs on host networking.

### 2. Network Group (console)
Create a Network Group in the console, add both apps as members, then **redeploy both** so
each instance becomes a peer. Confirm *peers == members*. On the agent, `ip a` should show a
`wg-*` interface with a `10.101.0.x` address.

### 3. Application
Deploy [`app/`](app/) as a buildpack app (e.g. Node). Point the tracer at the agent's NG
hostname:
```bash
clever env set DD_TRACE_AGENT_URL "http://<agentAppId>.m.<ngId>.cc-ng.cloud:8080"
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Agent deploy never finishes; `Nothing listening on 0.0.0.0:8080` | health check on a port nothing serves | `DD_APM_RECEIVER_PORT=8080` |
| Agent crash-loops: `unable to reliably determine the host name` | no metadata in the container | set `DD_HOSTNAME` |
| Instance CPU-starved; many stuck `agent health` processes | image HEALTHCHECK pileup | `HEALTHCHECK NONE` |
| Only `eth0 172.17.0.2`, no `wg`/`10.101`; traces `ECONNREFUSED` | Docker bridge mode | remove custom exposed port → host networking |
| `Members > 0` but `Peers: 0`, no `wg` interface | NG created via CLI doesn't peer | recreate the NG in the console, redeploy apps |
| `getaddrinfo ENOTFOUND ...cc-ng.cloud` | stale `<ngId>` in the hostname | copy the current domain from the console |
| App creates spans (trace_id in logs) but none reach Datadog | export/transport, not the tracer | verify NG peering + agent reachability on `:8080` |

## Notes

- Install `clever-tools` via Homebrew (`brew install CleverCloud/homebrew-tap/clever-tools`)
  if the npm package is blocked by a dependency-policy gate.
- `dd-trace` fails silently when it can't reach the agent — no crash, no error. The app's
  trace-id logger is there to prove the tracer is alive independently of delivery.
- Clever Cloud Network Groups are a beta feature; expect some rough edges (CLI/console
  inconsistency, peering quirks). This repo reflects what worked in mid-2026.

## References

- [Clever Cloud — Docker apps (network mode)](https://www.clever.cloud/developers/doc/applications/docker/#network-mode)
- [Clever Cloud — Network Groups](https://www.clever.cloud/developers/doc/develop/network-groups/)
- [Clever Cloud — Network Groups example](https://github.com/CleverCloud/network-groups-example)
- [Datadog — APM (Node.js)](https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/)
