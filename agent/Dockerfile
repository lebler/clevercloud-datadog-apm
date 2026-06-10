# Datadog Agent for Clever Cloud (Network Group member for qboule APM).
# Clever Cloud's Docker runtime builds + runs this from a git push.
#
# Secrets are NOT baked in: set DD_API_KEY in the Clever Cloud console UI.
# Also set as app env vars (console or `clever env set`):
#   DD_SITE = datadoghq.com  (US1; default, so optional)
#
# NETWORK MODE: do NOT set a custom CC_DOCKER_EXPOSED_HTTP_PORT. A custom port forces
# Docker *bridge* mode (172.17.x), which is isolated from Clever Cloud Network Groups.
# The DEFAULT port (8080) runs the container with `--net host`, giving it NG connectivity
# like a buildpack app. So we move the APM trace receiver to 8080 (below) — the trace
# endpoint then doubles as the health-check port, and the container stays on host net.
FROM datadog/agent:7

# Non-secret APM config (safe to commit).
#  - DD_HOSTNAME: Clever Cloud containers have no cloud metadata, so the agent
#    can't auto-derive a hostname and crash-loops without this.
#  - APM trace port bound to 0.0.0.0:8126 for Network Group access.
#  - Process/logs agents disabled: not needed for APM, and they fail noisily here.
ENV DD_HOSTNAME=qboule-agent \
    DD_APM_ENABLED=true \
    DD_APM_NON_LOCAL_TRAFFIC=true \
    DD_LOGS_ENABLED=false \
    DD_PROCESS_AGENT_ENABLED=false \
    DD_PROCESS_CONFIG_PROCESS_COLLECTION_ENABLED=false \
    DD_PROCESS_CONFIG_CONTAINER_COLLECTION_ENABLED=false \
    DD_SYSTEM_PROBE_ENABLED=false \
    DD_COMPLIANCE_CONFIG_ENABLED=false \
    DD_RUNTIME_SECURITY_CONFIG_ENABLED=false \
    DD_SBOM_ENABLED=false \
    DD_REMOTE_CONFIGURATION_ENABLED=false \
    DD_APM_RECEIVER_PORT=8080

# The stock image's Docker HEALTHCHECK runs `agent health` on a timer. On a
# resource-tight instance those calls hang (can't reach the core agent IPC) and
# never exit, piling up and starving CPU/RAM in a death spiral. Clever Cloud does
# its own port health check, so disable the image's entirely.
HEALTHCHECK NONE
