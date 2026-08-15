#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/sungate}"
POSTGRES_USER="${POSTGRES_USER:-sungate}"
POSTGRES_DB="${POSTGRES_DB:-sungate}"

require() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "Missing required value: ${name}" >&2
    exit 1
  fi
}

require DEPLOY_HOST
require DEPLOY_USER
require SSH_PRIVATE_KEY
require SUNGATE_IMAGE
require POSTGRES_PASSWORD
require GHCR_USER
require GHCR_TOKEN

SSH_DIR="${HOME}/.ssh"
mkdir -p "${SSH_DIR}"
chmod 700 "${SSH_DIR}"

umask 077
printf '%s\n' "${SSH_PRIVATE_KEY}" > "${SSH_DIR}/id_deploy"
chmod 600 "${SSH_DIR}/id_deploy"

KNOWN_HOSTS="${SSH_DIR}/known_hosts"
if [ -n "${DEPLOY_SSH_KNOWN_HOSTS:-}" ]; then
  printf '%s\n' "${DEPLOY_SSH_KNOWN_HOSTS}" > "${KNOWN_HOSTS}"
else
  echo "DEPLOY_SSH_KNOWN_HOSTS is empty; falling back to ssh-keyscan." >&2
  ssh-keyscan -H -p "${DEPLOY_PORT}" -T 10 "${DEPLOY_HOST}" > "${KNOWN_HOSTS}"
fi
chmod 600 "${KNOWN_HOSTS}"

SSH=(
  ssh
  -i "${SSH_DIR}/id_deploy"
  -p "${DEPLOY_PORT}"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="${KNOWN_HOSTS}"
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=4
)
SCP=(
  scp
  -i "${SSH_DIR}/id_deploy"
  -P "${DEPLOY_PORT}"
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o UserKnownHostsFile="${KNOWN_HOSTS}"
)

REMOTE="${DEPLOY_USER}@${DEPLOY_HOST}"

require DOMAIN

python3 - "${SUNGATE_IMAGE}" "${POSTGRES_USER}" "${POSTGRES_PASSWORD}" "${POSTGRES_DB}" "${DOMAIN}" <<'PY'
import pathlib, sys
from urllib.parse import urlparse

def quoted(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

image, user, password, db, domain = sys.argv[1:6]
raw = domain.strip()
if "://" not in raw:
    raw = "https://" + raw
host = urlparse(raw).hostname
if not host:
    raise SystemExit(f"DOMAIN must be a hostname or URL, got: {domain!r}")

lines = [
    f"SUNGATE_IMAGE={quoted(image)}",
    f"POSTGRES_USER={quoted(user)}",
    f"POSTGRES_PASSWORD={quoted(password)}",
    f"POSTGRES_DB={quoted(db)}",
    f"DOMAIN={quoted(domain)}",
    f"APP_HOST={quoted(host)}",
    f"COMPOSE_FILE={quoted('compose.yaml:compose.prod.yaml')}",
]
path = pathlib.Path(".env.deploy")
path.write_text("\n".join(lines) + "\n", encoding="utf-8")
path.chmod(0o600)
PY

"${SSH[@]}" "${REMOTE}" "mkdir -p '${DEPLOY_PATH}/docker'"
"${SCP[@]}" compose.yaml compose.prod.yaml "${REMOTE}:${DEPLOY_PATH}/"
"${SCP[@]}" docker/Caddyfile "${REMOTE}:${DEPLOY_PATH}/docker/"
"${SCP[@]}" .env.deploy "${REMOTE}:${DEPLOY_PATH}/.env"
rm -f .env.deploy

"${SSH[@]}" "${REMOTE}" "chmod 600 '${DEPLOY_PATH}/.env'"

# base64 so the token never needs shell quoting on the far side.
TOKEN_B64="$(printf '%s' "${GHCR_TOKEN}" | base64 -w0)"
GHCR_USER_Q="$(printf '%q' "${GHCR_USER}")"
DEPLOY_PATH_Q="$(printf '%q' "${DEPLOY_PATH}")"

"${SSH[@]}" "${REMOTE}" bash -s <<REMOTE
set -euo pipefail
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
printf '%s' '${TOKEN_B64}' | base64 -d | docker login ghcr.io -u ${GHCR_USER_Q} --password-stdin
cd ${DEPLOY_PATH_Q}
docker compose pull
docker compose up -d --remove-orphans --no-build --wait --wait-timeout 180
docker image prune -f
REMOTE

echo "Deployed ${SUNGATE_IMAGE} to ${REMOTE}:${DEPLOY_PATH}"
