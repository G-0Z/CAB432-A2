import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
const sm = new SecretsManagerClient({ region: process.env.AWS_REGION || "ap-southeast-2" });

export async function getSecretJson(name) {
    const resp = await sm.send(new GetSecretValueCommand({ SecretId: name }));
    const str = resp.SecretString || Buffer.from(resp.SecretBinary).toString("utf8");
    try { return JSON.parse(str); } catch { return { value: str }; }
}
