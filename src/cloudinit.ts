import * as pulumi from "@pulumi/pulumi";

export interface CloudInitConfig {
    domain: string;
    containerImage: string;
    dockerRegistry: string;
    dockerUsername: pulumi.Output<string>;
    dockerPassword: pulumi.Output<string>;
    basicAuthHash: string;
}

// Build the Caddy JSON config for the build worker
function buildCaddyConfig(config: CloudInitConfig): string {
    return JSON.stringify({
        apps: {
            http: {
                servers: {
                    srv0: {
                        listen: [":443"],
                        routes: [
                            {
                                match: [{ host: [config.domain] }],
                                handle: [{
                                    handler: "subroute",
                                    routes: [
                                        {
                                            handle: [{
                                                handler: "authentication",
                                                providers: {
                                                    http_basic: {
                                                        accounts: [{
                                                            username: "caddy",
                                                            password: config.basicAuthHash,
                                                        }],
                                                        hash: { algorithm: "bcrypt" },
                                                    },
                                                },
                                            }],
                                        },
                                        {
                                            handle: [{
                                                handler: "caddy_builder",
                                                purge_module_cache: true,
                                                timeout: 600000000000,
                                            }],
                                        },
                                    ],
                                }],
                                terminal: true,
                            },
                        ],
                    },
                },
            },
        },
    }, null, 6);
}

// Build the full cloud-init YAML for the VM
export function buildCloudInit(config: CloudInitConfig): pulumi.Output<string> {
    const caddyConfig = buildCaddyConfig(config);

    // Indent the Caddy JSON for embedding under the YAML write_files content block
    const indentedCaddyConfig = caddyConfig
        .split("\n")
        .map(line => `      ${line}`)
        .join("\n");

    return pulumi.interpolate`#cloud-config
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
${indentedCaddyConfig}

runcmd:
  - mkdir -p /data/caddy
  - curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  - echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  - apt-get update
  - apt-get install -y docker-ce docker-ce-cli containerd.io
  - systemctl enable docker
  - systemctl start docker
  - |
    if [ -n "${config.dockerUsername}" ] && [ -n "${config.dockerPassword}" ]; then
      echo "${config.dockerPassword}" | docker login ${config.dockerRegistry} -u "${config.dockerUsername}" --password-stdin
    fi
  - curl -fsSL https://go.dev/dl/go1.24.1.linux-amd64.tar.gz | tar -C /usr/local -xz
  - docker pull ${config.containerImage}
  - docker run -d --restart=always --name caddy -p 80:80 -p 443:443 -v /etc/caddy/config.json:/etc/caddy/config.json:ro -v /data/caddy:/data -v /usr/local/go:/usr/local/go -e PATH="/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" ${config.containerImage} caddy run --config /etc/caddy/config.json
`;
}
