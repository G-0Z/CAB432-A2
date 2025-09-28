// src/middleware/auth.middleware.js
import { CognitoJwtVerifier } from "aws-jwt-verify";

/**
 * Env needed for Cognito verification:
 *   COGNITO_USER_POOL_ID=ap-southeast-2_XXXXXXXXX
 *   COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx   (App client ID)
 * Optional:
 *   AUTH_BYPASS=1          // dev/demo: skip auth entirely
 *   AUTH_DEBUG=1           // include verifier error messages in responses
 */

let accessVerifier = null;
let idVerifier = null;

function ensureVerifiers() {
    const { COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID } = process.env;
    if (!COGNITO_USER_POOL_ID || !COGNITO_CLIENT_ID) return null;

    // Create once and reuse (JWKs are cached by the lib)
    if (!accessVerifier) {
        accessVerifier = CognitoJwtVerifier.create({
            userPoolId: COGNITO_USER_POOL_ID,
            tokenUse: "access",
            clientId: COGNITO_CLIENT_ID,
        });
    }
    if (!idVerifier) {
        idVerifier = CognitoJwtVerifier.create({
            userPoolId: COGNITO_USER_POOL_ID,
            tokenUse: "id",
            clientId: COGNITO_CLIENT_ID,
        });
    }
    return { accessVerifier, idVerifier };
}

export async function requireAuth(req, res, next) {
    try {
        // 🔧 Dev/demo bypass (great for assignment validation)
        if (process.env.AUTH_BYPASS === "1") {
            req.user = { sub: "dev-user", username: "dev", groups: [], tokenUse: "bypass" };
            return next();
        }

        // Get Bearer token
        const auth = req.headers.authorization || "";
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (!m) return res.status(401).json({ error: "Invalid token", detail: "Missing Bearer token" });
        const token = m[1];

        const verifiers = ensureVerifiers();
        if (!verifiers) {
            return res.status(500).json({
                error: "Auth not configured",
                detail: "Set COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID env vars",
            });
        }

        // Try ACCESS first (best for API auth), then fall back to ID
        try {
            const payload = await verifiers.accessVerifier.verify(token);
            req.user = {
                sub: payload.sub,
                username: payload.username || payload["cognito:username"] || payload.client_id,
                groups: payload["cognito:groups"] || [],
                tokenUse: "access",
            };
            return next();
        } catch (errAccess) {
            try {
                const payload = await verifiers.idVerifier.verify(token);
                req.user = {
                    sub: payload.sub,
                    username: payload["cognito:username"] || payload.email || payload.username,
                    groups: payload["cognito:groups"] || [],
                    tokenUse: "id",
                };
                return next();
            } catch (errId) {
                const detail =
                    process.env.AUTH_DEBUG === "1"
                        ? `accessFail=${errAccess?.message}; idFail=${errId?.message}`
                        : undefined;
                return res.status(401).json({ error: "Invalid token", detail });
            }
        }
    } catch (e) {
        return res.status(401).json({ error: "Invalid token", detail: e?.message });
    }
}

/** Optional: doesn’t require auth, but attaches req.user if valid */
export async function optionalAuth(req, _res, next) {
    const auth = req.headers.authorization || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (!m) return next();
    const token = m[1];

    const verifiers = ensureVerifiers();
    if (!verifiers) return next();

    try {
        const p = await verifiers.accessVerifier.verify(token);
        req.user = {
            sub: p.sub,
            username: p.username || p["cognito:username"] || p.client_id,
            groups: p["cognito:groups"] || [],
            tokenUse: "access",
        };
    } catch {
        try {
            const p = await verifiers.idVerifier.verify(token);
            req.user = {
                sub: p.sub,
                username: p["cognito:username"] || p.email || p.username,
                groups: p["cognito:groups"] || [],
                tokenUse: "id",
            };
        } catch {
            // ignore; continue unauthenticated
        }
    }
    next();
}
