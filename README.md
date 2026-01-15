# Caddy Azure Infrastructure

Deploy the Caddy build worker to Azure using Pulumi.

## Prerequisites

- Node.js 18+
- Pulumi CLI
- Azure CLI (logged in)

## Environment Setup

Create a `.env` file:

```bash
export AZURE_STORAGE_ACCOUNT="your-storage-account"
export AZURE_STORAGE_KEY="your-storage-key"
export PULUMI_CONFIG_PASSPHRASE=""
```

Then source it:

```bash
source .env
pulumi login azblob://pulumi
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
