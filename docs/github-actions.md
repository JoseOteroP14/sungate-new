# CI/CD — GitHub Actions

El pipeline construye la imagen en GitHub, la publica en GHCR y la arranca en el VPS (Ubuntu 26.04) por SSH. **Ningún secreto entra al repositorio.** El `.env` de producción se genera en cada deploy a partir de secrets/variables de GitHub y se escribe en el servidor con modo `600`.

```
GitHub secrets/vars
        │
        ▼
  deploy.yml  ──build──►  ghcr.io/<owner>/sungate-new:sha-<commit>
        │
        │  scp compose.yaml + .env
        ▼
  /opt/sungate/.env  ──Compose interpolation──►  contenedor `app`
                     ──env_file: .env─────────►  contenedor `app`
                     ──environment: POSTGRES_*─►  contenedor `db`
```

## Qué hace cada workflow

| Workflow | Cuándo | Qué |
|---|---|---|
| `.github/workflows/ci.yml` | Pull requests a `main` | `bun install`, `vite build`, `docker build` (sin push). La imagen pinta teselas FV con la grilla GHI del repo. |
| `.github/workflows/deploy.yml` | Push a `main`, o *Run workflow* | Build + push a GHCR + SSH deploy |
| `.github/workflows/solar-refresh.yml` | Días 1 y 16 de cada mes a las 00:17 America/Bogota (~cada 15 días), o *Run workflow* | Pide a Open-Meteo el año móvil de GHI, commitea `data/solar/ghi-grid.json` si cambió y dispara Deploy para regenerar teselas |

Las teselas que ves en el mapa **no se pintan en el navegador contra la API**. Salen de `public/tiles/overture-buildings.pmtiles`, generado en el build de la imagen a partir de la grilla GHI (Open-Meteo Historical Weather API, modelo ECMWF IFS, ventana de 12 meses con ~2 días de desfase). El job nocturno actualiza esa grilla; el deploy vuelve a calcular `kwh_year` por techo.

Si `main` está protegida, permite a `github-actions[bot]` hacer push o el refresh no podrá commitear.

Rollback: *Actions → Deploy → Run workflow* y pega un tag anterior (`sha-abc1234`). No reconstruye; solo reetiqueta y levanta esa imagen.

## 1. Entorno `production` en GitHub

1. Repo → **Settings → Environments → New environment** → nombre `production`.
2. (Opcional) activa *Required reviewers* para exigir aprobación antes de desplegar.
3. En ese entorno, crea las **variables** y **secrets** de las tablas de abajo.  
   *Settings → Secrets and variables → Actions* también vale, pero el entorno `production` limita el alcance al job de deploy.

### Variables (no sensibles) — *Environment variables*

| Nombre | Ejemplo | Para qué |
|---|---|---|
| `DEPLOY_HOST` | `203.0.113.10` o `sungate.salesconnect.dev` | Host SSH del VPS |
| `DEPLOY_USER` | `deploy` | Usuario SSH (debe poder ejecutar `docker`) |
| `DEPLOY_PORT` | `22` | Puerto SSH. Si se omite, el script usa `22` |
| `DEPLOY_PATH` | `/opt/sungate` | Directorio de Compose en el servidor. Default `/opt/sungate` |
| `POSTGRES_USER` | `sungate` | Usuario de PostgreSQL. Default `sungate` |
| `POSTGRES_DB` | `sungate` | Base de datos. Default `sungate` |
| `DOMAIN` | `https://sungate.salesconnect.dev` | URL pública (aparece en el environment de GitHub) |

### Secrets (sensibles) — *Environment secrets*

| Nombre | Qué pegar |
|---|---|
| `DEPLOY_SSH_KEY` | **Clave privada** completa (`-----BEGIN OPENSSH PRIVATE KEY-----` … `-----END …`). La pública ya debe estar en `~/.ssh/authorized_keys` del `DEPLOY_USER`. |
| `POSTGRES_PASSWORD` | Contraseña de PostgreSQL. **Distinta** de la de desarrollo. |
| `DEPLOY_SSH_KNOWN_HOSTS` | Salida de `ssh-keyscan -H -p 22 TU_HOST` (varias líneas). Evita MITM. Si se deja vacío, el workflow hace `ssh-keyscan` en el momento (menos seguro). |

Cómo obtener `DEPLOY_SSH_KNOWN_HOSTS` (en tu máquina, no en el repo).

El `ssh-keyscan` de Windows (OpenSSH 9.5) falla contra Ubuntu 26.04 (`choose_kex: unsupported KEX method sntrup761…`). Usa el de Git for Windows:

```powershell
& 'C:\Program Files\Git\usr\bin\ssh-keyscan.exe' -H -t ed25519,ecdsa,rsa -p 22 54.237.230.64
& 'C:\Program Files\Git\usr\bin\ssh-keyscan.exe' -H -t ed25519,ecdsa,rsa -p 22 sungate.salesconnect.dev
```

Pega en el secret **solo** las líneas que empiezan por `|1|` (hashed) o por la IP/hostname. Omite las que empiezan por `#`. Incluye IP y dominio si `DEPLOY_HOST` puede ser cualquiera de los dos.

`GITHUB_TOKEN` no se configura: GitHub lo inyecta. El workflow lo usa para push/pull en GHCR y **no se guarda en el servidor**.

## 2. Cómo llegan las envs al contenedor

Hay dos canales, a propósito:

1. **Interpolación de Compose** (archivo `.env` junto a `compose.yaml`).  
   Resuelve `${POSTGRES_PASSWORD}` y construye `DATABASE_URL` **antes** de crear el contenedor.
2. **`env_file: .env` + bloque `environment:`** en el servicio `app`.  
   Inyecta las mismas claves **dentro** del contenedor en runtime. El `Dockerfile` declara esos `ENV` y Compose los pisa con los valores reales. Las credenciales **no** se hornean en la imagen.

El servicio `db` recibe `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` por `environment:`.

### Qué no meter en `VITE_*`

Esta app es un SPA servido por nginx. Todo `VITE_*` se embebe en el JS **en el build** y acaba en el navegador. Nunca uses `VITE_POSTGRES_PASSWORD` ni ningún secreto con prefijo `VITE_`.

`POSTGRES_*` y `DATABASE_URL` viven solo en el contenedor (procesos del server). El JS del cliente no las ve, y no debe verlas.

Si más adelante el frontend necesita la URL pública en build time, pásala como build-arg `VITE_DOMAIN` (dato público), no como secret.

## 3. Preparar el servidor (una vez)

SSH al VPS como root o un usuario con sudo.

```bash
# Docker Engine + Compose v2 (repo oficial, no el paquete docker.io de Ubuntu)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker deploy   # el DEPLOY_USER

sudo mkdir -p /opt/sungate
sudo chown deploy:deploy /opt/sungate
```

Cierra sesión y vuelve a entrar para que el grupo `docker` aplique. Comprueba:

```bash
docker compose version
docker info >/dev/null && echo ok
```

La clave **pública** correspondiente a `DEPLOY_SSH_KEY` debe estar en `/home/deploy/.ssh/authorized_keys` (`chmod 700 ~/.ssh`, `chmod 600 ~/.ssh/authorized_keys`).

DNS: el dominio (`sungate.salesconnect.dev`) debe apuntar a la IP del VPS.

En producción, Caddy (servicio `proxy` en `compose.prod.yaml`) escucha en **80/443**, pide el certificado Let's Encrypt y reenvía a `app:8080` en la red de Compose. La app sigue publicada solo en `127.0.0.1:8080` (útil para `curl` en el propio servidor).

En AWS EC2 abre el **Security Group** de la instancia: inbound TCP **22**, **80** y **443** desde `0.0.0.0/0`. Sin 80/443 el dominio hace timeout aunque Compose esté healthy. No abras 5432 ni 8080 al mundo.

En el servidor, si `ufw` está activo:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

## 4. Primer deploy

1. Crea el environment y rellena variables + secrets.
2. Merge a `main` (o *Run workflow* en **Deploy**).
3. El job deja en el servidor:

```
/opt/sungate/
  compose.yaml
  compose.prod.yaml
  .env          # 600, generado; no está en git
```

4. Comprueba:

```bash
ssh deploy@TU_HOST 'docker compose -f /opt/sungate/compose.yaml ps'
curl -I https://sungate.salesconnect.dev
```

GHCR: el primer push crea el paquete `sungate-new`. Si el repo es privado, el pull en el VPS usa `GITHUB_TOKEN` del job (caduca con el workflow; no queda persistido).

## 5. Rotar un secreto

1. Cambia el valor en **Settings → Environments → production**.
2. Lanza **Deploy** otra vez (push vacío o *Run workflow*).
3. El script **reescribe** `/opt/sungate/.env` y hace `docker compose up -d`.  
   Si cambias `POSTGRES_PASSWORD` **después** de que el volumen de Postgres ya exista, también hay que alterarlo dentro de Postgres; Compose solo afecta contenedores nuevos / recreados, no la contraseña ya inicializada en el data dir.

## 6. Local vs producción

| | Local | Producción |
|---|---|---|
| Envs | `.env` (gitignored), copia de `.env.example` | GitHub secrets/vars → `/opt/sungate/.env` |
| Imagen | `docker compose up --build` (`sungate-app:local`) | `ghcr.io/<owner>/<repo>:sha-…` |
| Overlay | solo `compose.yaml` | `compose.yaml` + `compose.prod.yaml` |
| App | `127.0.0.1:8080` | igual, detrás del proxy TLS |
