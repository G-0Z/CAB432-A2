// src/services/cognito.service.js
import "dotenv/config";
import crypto from "crypto";
import {
    CognitoIdentityProviderClient,
    SignUpCommand,
    ConfirmSignUpCommand,
    InitiateAuthCommand,
    RespondToAuthChallengeCommand
} from "@aws-sdk/client-cognito-identity-provider";

const region = process.env.AWS_REGION || "ap-southeast-2";
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || null;

if (!CLIENT_ID) throw new Error("COGNITO_CLIENT_ID not set");

const client = new CognitoIdentityProviderClient({ region });

function secretHash(username) {
    if (!CLIENT_SECRET) return undefined;
    const hmac = crypto.createHmac("sha256", CLIENT_SECRET);
    hmac.update(username + CLIENT_ID);
    return hmac.digest("base64");
}

export async function signup({ username, email, password }) {
    const params = {
        ClientId: CLIENT_ID,
        Username: username,
        Password: password,
        UserAttributes: [{ Name: "email", Value: email }]
    };
    const sh = secretHash(username);
    if (sh) params.SecretHash = sh;
    return client.send(new SignUpCommand(params));
}

export async function confirmSignup({ username, code }) {
    const params = {
        ClientId: CLIENT_ID,
        Username: username,
        ConfirmationCode: code
    };
    const sh = secretHash(username);
    if (sh) params.SecretHash = sh;
    return client.send(new ConfirmSignUpCommand(params));
}

export async function login({ username, password }) {
    const authParams = {
        USERNAME: username,
        PASSWORD: password
    };
    const sh = secretHash(username);
    if (sh) authParams.SECRET_HASH = sh;

    const resp = await client.send(new InitiateAuthCommand({
        ClientId: CLIENT_ID,
        AuthFlow: "USER_PASSWORD_AUTH",
        AuthParameters: authParams
    }));

    return {
        tokens: resp.AuthenticationResult,
        challenge: resp.ChallengeName || null,
        session: resp.Session || null
    };
}

// Optional helper if you ever handle NEW_PASSWORD_REQUIRED or MFA
export async function respondNewPassword({ username, newPassword, session }) {
    const params = {
        ClientId: CLIENT_ID,
        ChallengeName: "NEW_PASSWORD_REQUIRED",
        Session: session,
        ChallengeResponses: {
            USERNAME: username,
            NEW_PASSWORD: newPassword
        }
    };
    const sh = secretHash(username);
    if (sh) params.ChallengeResponses.SECRET_HASH = sh;

    const resp = await client.send(new RespondToAuthChallengeCommand(params));
    return { tokens: resp.AuthenticationResult };
}
