import "dotenv/config";
import { loadSecretsSafe } from "../config/secrets.js";

(async () => {
    // Force read from the specific secret you said you’re using
    process.env.SNAPNOTES_SECRETS_MODE  = process.env.SNAPNOTES_SECRETS_MODE  || "sm-read";
    process.env.SNAPNOTES_SECRET_NAME   = process.env.SNAPNOTES_SECRET_NAME   || "n11543027/jwt";
    process.env.AWS_REGION              = process.env.AWS_REGION              || "ap-southeast-2";

    // Load secrets FIRST (before importing any modules that read env)
    const { secrets, source } = await loadSecretsSafe();

    // Prefer secret values over any stale env
    process.env.JWT_SECRET             = secrets.JWT_SECRET            ?? process.env.JWT_SECRET;
    process.env.COGNITO_CLIENT_ID      = secrets.COGNITO_CLIENT_ID     ?? process.env.COGNITO_CLIENT_ID;
    process.env.COGNITO_CLIENT_SECRET  = secrets.COGNITO_CLIENT_SECRET ?? process.env.COGNITO_CLIENT_SECRET;

    console.log("Secrets source:", source);
    console.log("COGNITO_CLIENT_ID:", (process.env.COGNITO_CLIENT_ID || "").slice(0, 6) + "…");

    // Now import the app (routers/services can safely read env)
    await import("./app.js");
})().catch((err) => {
    console.error("Bootstrap failed:", err);
    process.exit(1);
});