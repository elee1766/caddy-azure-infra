# Caddy Azure Infrastructure

Deploy the Caddy build worker to Azure using Pulumi.

## Architecture

A single Azure VM (`Standard_B4s_v2`) runs the
[buildworker](https://github.com/caddyserver/buildworker) container, which
compiles custom Caddy binaries on demand. The VM is provisioned via cloud-init
which installs Docker and Go, pulls the buildworker container image, and starts
Caddy with a JSON config.

### Resources

- **Resource Group** - contains all Azure resources
- **Virtual Network / Subnet** (`10.0.0.0/16`, `10.0.1.0/24`)
- **Network Security Group** - allows ICMP, HTTP (80), HTTPS (443), SSH (22)
- **Static Public IP** - assigned to the VM
- **DNS A Record** - `worker-0.infra.caddyserver.com` pointing to the public IP
  (zone managed in `caddy-rgaaa33a6a`)
- **Ubuntu 24.04 VM** - runs the buildworker Docker container

### How it works

1. Caddy listens on `:443` with automatic HTTPS (Let's Encrypt)
2. All requests require HTTP basic auth (username: `caddy`, bcrypt-hashed password)
3. Clients POST a JSON build config (OS, arch, plugins) to the worker
4. The worker compiles a custom Caddy binary using `xcaddy` and returns it as a
   multipart response
5. Go is installed on the host and volume-mounted into the container

### Endpoint

- **URL:** `https://worker-0.infra.caddyserver.com`
- **Auth:** HTTP basic (`caddy` / password from `.env`)
- **Health check:** `GET /health` (no auth required)

## Prerequisites

- Node.js 18+
- Pulumi CLI
- Azure CLI (logged in)

## Environment Setup

Create a `.env` file:

```bash
export AZURE_STORAGE_ACCOUNT="pulumi-state-0"
export AZURE_STORAGE_KEY="your-storage-key"
export PULUMI_CONFIG_PASSPHRASE=""
export BASIC_AUTH_USERNAME="caddy"
export BASIC_AUTH_PASSWORD="your-basic-auth-password"
```

Then source it:

```bash
source .env
pulumi login azblob://pulumi
pulumi stack select dev
```

## Configuration

### Container Image (Required)

```bash
pulumi config set caddy-azure-infra:containerImage ghcr.io/caddyserver/buildworker:master
```

### Private Registry Credentials

For private GHCR images, create a GitHub PAT with `read:packages` scope, then:

```bash
pulumi config set --secret caddy-azure-infra:dockerUsername YOUR_GITHUB_USERNAME
pulumi config set --secret caddy-azure-infra:dockerPassword YOUR_GITHUB_PAT
```

## Deploy

```bash
npm install
pulumi up
```

## Outputs

- `publicIpAddress` - Public IP of the VM
- `sslipUrl` - HTTPS URL via sslip.io
- `sshPrivateKey` - SSH key for VM access

## Cleanup

```bash
pulumi destroy
```
