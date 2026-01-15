import * as pulumi from "@pulumi/pulumi";
import { createBuildWorker } from "./buildworker";

const config = new pulumi.Config();

const buildWorker = createBuildWorker({
    containerImage: config.get("containerImage"),
    dockerUsername: config.getSecret("dockerUsername"),
    dockerPassword: config.getSecret("dockerPassword"),
});

export const resourceGroupName = buildWorker.resourceGroupName;
export const publicIpAddress = buildWorker.publicIpAddress;
export const vmName = buildWorker.vmName;
export const url = buildWorker.url;
export const sslipUrl = buildWorker.sslipUrl;
export const sshPrivateKey = pulumi.secret(buildWorker.sshPrivateKey);
