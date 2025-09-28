import { SSMClient, GetParametersCommand } from "@aws-sdk/client-ssm";
const ssm = new SSMClient({ region: process.env.AWS_REGION || "ap-southeast-2" });

export async function loadParams(names = []) {
    if (!names.length) return {};
    const resp = await ssm.send(new GetParametersCommand({ Names: names, WithDecryption: false }));
    const out = {};
    (resp.Parameters || []).forEach(p => { out[p.Name] = p.Value; });
    return out;
}
