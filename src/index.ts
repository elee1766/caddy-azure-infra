import * as pulumi from "@pulumi/pulumi";
import * as tls from "@pulumi/tls";
import { createBuildWorker, BuildWorkerOutputs } from "./buildworker";

const config = new pulumi.Config();

// Shared SSH key for all workers (SSH is blocked by NSG, but Azure requires auth)
const sshKey = new tls.PrivateKey("caddy-ssh-key", {
    algorithm: "ED25519",
});

// Worker-0: standalone, can be updated independently (blue-green)
const worker0 = createBuildWorker({
    containerImage: config.get("containerImage"),
    dockerUsername: config.getSecret("dockerUsername"),
    dockerPassword: config.getSecret("dockerPassword"),
    hostname: "worker-0",
    sshKey,
});

export const resourceGroupName = worker0.resourceGroupName;
export const publicIpAddress = worker0.publicIpAddress;
export const vmName = worker0.vmName;
export const url = worker0.url;
export const sshPrivateKey = pulumi.secret(sshKey.privateKeyOpenssh);

// Workers 1-N: the fleet, deployed sequentially to avoid breaking everything on failure
const fleetSize = config.getNumber("fleetSize") || 4;
const fleet: Record<string, BuildWorkerOutputs> = {};
let previousWorker: BuildWorkerOutputs | undefined = worker0;
for (let i = 1; i <= fleetSize; i++) {
    const worker = createBuildWorker({
        containerImage: config.get("containerImage"),
        dockerUsername: config.getSecret("dockerUsername"),
        dockerPassword: config.getSecret("dockerPassword"),
        hostname: `worker-${i}`,
        sshKey,
        dependsOn: previousWorker?.vm,
    });
    fleet[`worker-${i}`] = worker;
    previousWorker = worker;
}

export const fleetWorkers = Object.fromEntries(
    Object.entries(fleet).map(([name, w]) => [name, {
        resourceGroupName: w.resourceGroupName,
        publicIpAddress: w.publicIpAddress,
        vmName: w.vmName,
        url: w.url,
    }]),
);
