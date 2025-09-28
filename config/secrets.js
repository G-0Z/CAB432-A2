// config/secrets.js
import { fromSSO } from "@aws-sdk/credential-providers";
import {
    SecretsManagerClient,
    GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import {
    SSMClient,
    GetParameterCommand,
} from "@aws-sdk/client-ssm";

const REGION      = process.env.AWS_REGION || "ap-southeast-2";
const PROFILE     = process.env.AWS_PROFILE || "CAB432-student";
const MODE        = (process.env.SNAPNOTES_SECRETS_MODE || "").toLowerCase(); // "sm-read" | "ssm-read" | "env" | ""
const SECRET_NAME = process.env.SNAPNOTES_SECRET_NAME || "snapnotes/jwt";
const PARAM_PREFIX= process.env.SNAPNOTES_PARAM_PREFIX || "/snapnotes";

const credentials = fromSSO({ profile: PROFILE }); // local SSO; on EC2 with an instance role you can remove this

const sm  = new SecretsManagerClient({ region: REGION, credentials });
const ssm = new SSMClient({ region: REGION, credentials });

const REQUIRED_KEYS = ["JWT_SECRET", "COGNITO_CLIENT_ID", "COGNITO_CLIENT_SECRET"];

/* ---------- loaders (read-only) ---------- */

function loadFromEnv() {
    const secrets = {
        JWT_SECRET: process.env.JWT_SECRET,
        COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
        COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    };
    // minimal validation: require at least JWT_SECRET
    if (!secrets.JWT_SECRET) {
        throw new Error("Missing JWT_SECRET in environment (SNAPNOTES_SECRETS_MODE=env).");
    }
    return { secrets, source: "env" };
}

async function loadFromSecretsManager(name = SECRET_NAME) {
    const res = await sm.send(new GetSecretValueCommand({ SecretId: name }));
    const parsed = res.SecretString ? JSON.parse(res.SecretString) : {};
    return { secrets: parsed, source: "SecretsManager" };
}

async function loadFromParameterStore(prefix = PARAM_PREFIX) {
    const out = {};
    for (const key of REQUIRED_KEYS) {
        try {
            const r = await ssm.send(
                new GetParameterCommand({ Name: `${prefix}/${key}`, WithDecryption: true })
            );
            out[key] = r.Parameter?.Value;
        } catch (e) {
            // ignore missing; we validate later
        }
    }
    return { secrets: out, source: "SSM" };
}

/* ---------- public API ---------- */

/**
 * Loads secrets without ever writing to AWS.
 * Honors SNAPNOTES_SECRETS_MODE if set; otherwise tries SM → SSM → env.
 * Returns: { secrets: {JWT_SECRET,...}, source: "SecretsManager"|"SSM"|"env" }
 */
export async function loadSecretsSafe() {
    try {
        if (MODE === "env")       return loadFromEnv();
        if (MODE === "sm-read")   return await loadFromSecretsManager(SECRET_NAME);
        if (MODE === "ssm-read")  return await loadFromParameterStore(PARAM_PREFIX);

        // default: SM → SSM → env
        try { return await loadFromSecretsManager(SECRET_NAME); }
        catch (e1) {
            if (e1.name !== "AccessDeniedException" && e1.name !== "ResourceNotFoundException") throw e1;
            try { return await loadFromParameterStore(PARAM_PREFIX); }
            catch (e2) {
                if (e2.name !== "AccessDeniedException") throw e2;
                return loadFromEnv();
            }
        }
    } catch (e) {
        const hint = "Tip: set SNAPNOTES_SECRETS_MODE=env and provide JWT_SECRET/COGNITO_* via env to bypass AWS.";
        throw new Error(`${e.name}: ${e.message}\n${hint}`);
    }
}
