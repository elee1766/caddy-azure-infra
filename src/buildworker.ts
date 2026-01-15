import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import * as resources from "@pulumi/azure-native/resources";
import * as network from "@pulumi/azure-native/network";
import * as compute from "@pulumi/azure-native/compute";

export interface BuildWorkerConfig {
    containerImage?: string;
    dockerUsername?: pulumi.Output<string>;
    dockerPassword?: pulumi.Output<string>;
}

export interface BuildWorkerOutputs {
    resourceGroupName: pulumi.Output<string>;
    publicIpAddress: pulumi.Output<string | undefined>;
    vmName: pulumi.Output<string>;
    url: pulumi.Output<string>;
    sslipUrl: pulumi.Output<string>;
    sshPrivateKey: pulumi.Output<string>;
}

export function createBuildWorker(config: BuildWorkerConfig): BuildWorkerOutputs {
    const vmSize = "Standard_B4s_v2";
    const containerImage = config.containerImage
    if (!containerImage) {
        throw new Error("containerImage must be specified");
    }
    const dockerUsername = config.dockerUsername || pulumi.output("");
    const dockerPassword = config.dockerPassword || pulumi.output("");

    // Resource Group
    const resourceGroup = new resources.ResourceGroup("caddy-rg");

    // Static Public IP - created first so we know the IP for the config
    const publicIp = new network.PublicIPAddress("caddy-pip", {
        resourceGroupName: resourceGroup.name,
        publicIPAllocationMethod: "Static",
        sku: { name: "Standard" },
    });

    const sslipDomain = pulumi.interpolate`${publicIp.ipAddress}.sslip.io`;

    // Cloud-init script to install Docker and run Caddy with HTTPS via sslip.io
    const cloudInit = pulumi.interpolate`#cloud-config
package_update: true
package_upgrade: true
packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release

write_files:
  - path: /etc/caddy/config.json
    permissions: '0644'
    content: |
      {
        "apps": {
          "http": {
            "servers": {
              "srv0": {
                "listen": [":443"],
                "routes": [
                  {
                    "match": [{"host": ["${sslipDomain}"]}],
                    "handle": [{
                      "handler": "subroute",
                      "routes": [
                        {
                          "handle": [{
                            "handler": "authentication",
                            "providers": {
                              "http_basic": {
                                "accounts": [{
                                  "username": "caddy",
                                  "password": "$2a$14$alkJaDk17ojdhBWhAZdBRukqJVCT6zRXHW9GFyfFyx5Zze2RV3B/q"
                                }],
                                "hash": {"algorithm": "bcrypt"}
                              }
                            }
                          }]
                        },
                        {
                          "handle": [{
                            "handler": "caddy_builder",
                            "purge_module_cache": true
                          }]
                        }
                      ]
                    }],
                    "terminal": true
                  }
                ]
              }
            }
          }
        }
      }

runcmd:
  - mkdir -p /data/caddy
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker
  - systemctl start docker
  - |
    if [ -n "${dockerUsername}" ] && [ -n "${dockerPassword}" ]; then
      echo "${dockerPassword}" | docker login -u "${dockerUsername}" --password-stdin
    fi
  - docker pull ${containerImage}
  - docker run -d --restart=always --name caddy -p 80:80 -p 443:443 -v /etc/caddy/config.json:/etc/caddy/config.json:ro -v /data/caddy:/data ${containerImage} caddy run --config /etc/caddy/config.json
`;

    // Virtual Network
    const vnet = new network.VirtualNetwork("caddy-vnet", {
        resourceGroupName: resourceGroup.name,
        addressSpace: {
            addressPrefixes: ["10.0.0.0/16"],
        },
    });

    // Subnet
    const subnet = new network.Subnet("caddy-subnet", {
        resourceGroupName: resourceGroup.name,
        virtualNetworkName: vnet.name,
        addressPrefix: "10.0.1.0/24",
    });

    // Network Security Group
    const nsg = new network.NetworkSecurityGroup("caddy-nsg", {
        resourceGroupName: resourceGroup.name,
        securityRules: [
            {
                name: "allow-icmp",
                priority: 100,
                direction: "Inbound",
                access: "Allow",
                protocol: "Icmp",
                sourcePortRange: "*",
                destinationPortRange: "*",
                sourceAddressPrefix: "*",
                destinationAddressPrefix: "*",
            },
            {
                name: "allow-http",
                priority: 110,
                direction: "Inbound",
                access: "Allow",
                protocol: "Tcp",
                sourcePortRange: "*",
                destinationPortRange: "80",
                sourceAddressPrefix: "*",
                destinationAddressPrefix: "*",
            },
            {
                name: "allow-https",
                priority: 120,
                direction: "Inbound",
                access: "Allow",
                protocol: "Tcp",
                sourcePortRange: "*",
                destinationPortRange: "443",
                sourceAddressPrefix: "*",
                destinationAddressPrefix: "*",
            },
            {
                name: "allow-ssh",
                priority: 130,
                direction: "Inbound",
                access: "Allow",
                protocol: "Tcp",
                sourcePortRange: "*",
                destinationPortRange: "22",
                sourceAddressPrefix: "*",
                destinationAddressPrefix: "*",
            },
        ],
    });

    // Network Interface
    const nic = new network.NetworkInterface("caddy-nic", {
        resourceGroupName: resourceGroup.name,
        networkSecurityGroup: { id: nsg.id },
        ipConfigurations: [{
            name: "ipconfig",
            subnet: { id: subnet.id },
            publicIPAddress: { id: publicIp.id },
        }],
    });

    // Generate SSH key pair for VM (SSH is blocked by NSG, but Azure requires auth)
    const sshKey = new tls.PrivateKey("caddy-ssh-key", {
        algorithm: "ED25519",
    });

    // Virtual Machine
    const vm = new compute.VirtualMachine("caddy-vm", {
        resourceGroupName: resourceGroup.name,
        hardwareProfile: {
            vmSize: vmSize,
        },
        osProfile: {
            computerName: "caddy-builder",
            adminUsername: "azureuser",
            linuxConfiguration: {
                disablePasswordAuthentication: true,
                ssh: {
                    publicKeys: [{
                        path: "/home/azureuser/.ssh/authorized_keys",
                        keyData: sshKey.publicKeyOpenssh,
                    }],
                },
            },
            customData: cloudInit.apply(s => Buffer.from(s).toString("base64")),
        },
        storageProfile: {
            imageReference: {
                publisher: "Canonical",
                offer: "ubuntu-24_04-lts",
                sku: "server",
                version: "latest",
            },
            osDisk: {
                createOption: "FromImage",
                caching: "ReadWrite",
                managedDisk: {
                    storageAccountType: "StandardSSD_LRS",
                },
                deleteOption: "Delete",
            },
        },
        networkProfile: {
            networkInterfaces: [{
                id: nic.id,
            }],
        },
    }, {
        replaceOnChanges: ["osProfile.customData"],
        deleteBeforeReplace: true,
    });

    return {
        resourceGroupName: resourceGroup.name,
        publicIpAddress: publicIp.ipAddress,
        vmName: vm.name,
        url: pulumi.interpolate`https://${publicIp.ipAddress}.sslip.io`,
        sslipUrl: pulumi.interpolate`https://${publicIp.ipAddress}.sslip.io`,
        sshPrivateKey: sshKey.privateKeyOpenssh,
    };
}
