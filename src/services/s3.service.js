// src/services/s3.service.js
import { defaultProvider } from "@aws-sdk/credential-provider-node";
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region = process.env.AWS_REGION || "ap-southeast-2";
const bucket = process.env.S3_BUCKET;
if (!bucket) throw new Error("Missing S3_BUCKET");

const provider = defaultProvider({}); // single credential provider instance
const s3 = new S3Client({ region, credentials: provider });

function sanitizeFilename(name) {
    return String(name).replace(/[/\\?%*:|"<>]/g, "_");
}

/** Ensure bucket is reachable (optional: call once on startup) */
export async function assertBucketReachable() {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
}

/** Create a safe key like uploads/2025-09-28T10-30-00-000Z-filename.ext */
export function makeObjectKey(filename) {
    const safe = sanitizeFilename(filename || "file.bin");
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    return `uploads/${ts}-${safe}`;
}

/** Internal: get fresh creds if close to expiry */
async function getFreshCreds(minMs = 5 * 60 * 1000) {
    let creds = await s3.config.credentials();
    const msLeft = creds?.expiration ? creds.expiration.getTime() - Date.now() : 0;

    if (creds?.canExpire && typeof creds.refresh === "function") {
        if (!creds.expiration || msLeft < minMs) {
            try {
                await creds.refresh();
                creds = await s3.config.credentials(); // re-read after refresh
            } catch {
                // ignore; we'll fall back to whatever we have
            }
        }
    }
    return creds;
}

/** Presign a PUT for browser upload */
export async function getPresignedUpload({ key, contentType }) {
    if (!key) throw new Error("key is required");
    const ct = contentType || "application/octet-stream";

    // Refresh/guard near-expiry creds (try refresh first, then compute window)
    const creds = await getFreshCreds();
    const now = Date.now();
    const expMs = creds?.expiration instanceof Date ? creds.expiration.getTime() : null;

    let expiresIn = 900; // 15 min default
    if (expMs) {
        const remaining = Math.floor((expMs - now) / 1000);
        // leave 60s safety margin
        expiresIn = Math.max(60, Math.min(expiresIn, remaining - 60));
        // only bail if truly about to die and refresh didn't help
        if (remaining <= 30) throw new Error("CREDENTIALS_NEAR_EXPIRY");
    }

    const cmd = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: ct,
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn });
    const credQP = new URL(url).searchParams.get("X-Amz-Credential"); // who signed

    return {
        url,
        key,
        expiresIn,
        headers: { "Content-Type": ct },
        _signedWith: credQP, // dev-only; remove in prod
    };
}

/** Presign a GET for download */
export async function getPresignedDownload({ key, asFilename, contentType }) {
    if (!key) throw new Error("key is required");

    // Same refresh/guard as upload
    const creds = await getFreshCreds();
    const now = Date.now();
    const expMs = creds?.expiration instanceof Date ? creds.expiration.getTime() : null;

    let expiresIn = 600; // 10 min
    if (expMs) {
        const remaining = Math.floor((expMs - now) / 1000);
        expiresIn = Math.max(60, Math.min(expiresIn, remaining - 60));
        if (remaining <= 30) throw new Error("CREDENTIALS_NEAR_EXPIRY");
    }

    const ResponseContentDisposition = asFilename
        ? `attachment; filename="${String(asFilename).replace(/"/g, "")}"`
        : undefined;

    const cmd = new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition,
        ResponseContentType: contentType || undefined,
    });

    const url = await getSignedUrl(s3, cmd, { expiresIn });
    return { url, key, expiresIn };
}
