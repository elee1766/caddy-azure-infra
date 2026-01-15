# Caddy Azure Infrastructure

Deploy containerized workloads to Azure Virtual Machine Scale Sets using Pulumi.

## Prerequisites

- Node.js 18+
- Pulumi CLI
- Azure CLI (logged in)
- Azure subscription

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Azure Blob Storage Backend

Create a storage account and container for Pulumi state:

```bash
# Set variables
RESOURCE_GROUP="pulumi-state-rg"
STORAGE_ACCOUNT="pulumistate$RANDOM"
CONTAINER="pulumi"
LOCATION="eastus"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create storage account
az storage account create \
  --name $STORAGE_ACCOUNT \
  --resource-group $RESOURCE_GROUP \
  --location $LOCATION \
  --sku Standard_LRS \
  --encryption-services blob

# Get storage account key
ACCOUNT_KEY=$(az storage account keys list \
  --resource-group $RESOURCE_GROUP \
  --account-name $STORAGE_ACCOUNT \
  --query '[0].value' -o tsv)

# Create container
az storage container create \
  --name $CONTAINER \
  --account-name $STORAGE_ACCOUNT \
  --account-key $ACCOUNT_KEY

# Print the backend URL
echo "Backend URL: azblob://$CONTAINER"
echo "Storage Account: $STORAGE_ACCOUNT"
```

### 3. Login to Azure Blob Storage Backend

```bash
# Set environment variables for authentication
export AZURE_STORAGE_ACCOUNT="<your-storage-account>"
export AZURE_STORAGE_KEY="<your-storage-key>"

# Or use SAS token
# export AZURE_STORAGE_SAS_TOKEN="<your-sas-token>"

# Login to the backend
pulumi login azblob://<container-name>
```

### 4. Initialize Stack

```bash
# Create a new stack
pulumi stack init dev

# Set your SSH public key (required)
pulumi config set --secret sshPublicKey "$(cat ~/.ssh/id_rsa.pub)"

# Set Azure location (optional, defaults to eastus)
pulumi config set azure-native:location eastus
```

## Configuration Options

| Config | Description | Default |
|--------|-------------|---------|
| `vmSize` | Azure VM size | `Standard_B2s` |
| `instanceCount` | Number of VMs in scale set | `2` |
| `adminUsername` | VM admin username | `azureuser` |
| `containerImage` | Docker image to run | `nginx:latest` |
| `containerPort` | Container port to expose | `80` |
| `sshPublicKey` | SSH public key (required) | - |

## Deploy

```bash
pulumi up
```

## Outputs

- `resourceGroupName` - Azure resource group name
- `publicIpAddress` - Public IP of the load balancer
- `vmssName` - Name of the VM scale set
- `loadBalancerUrl` - URL to access your application

## Updating Container Image

```bash
pulumi config set containerImage your-image:tag
pulumi up
```

## Cleanup

```bash
pulumi destroy
```
