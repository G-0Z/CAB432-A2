// src/app.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import morgan from "morgan";
import http from "node:http";

import { router as authRouter } from "./controllers/auth.controller.js";
import { router as notesRouter } from "./controllers/notes.controller.js";
import { router as uploadRouter } from "./controllers/upload.controller.js";
import { errorMiddleware, notFoundMiddleware } from "./middleware/error.middleware.js";

const app = express();

/* ---------- CORS ---------- */
const defaultOrigins = ["http://13.236.116.179:3000"];
const envOrigins = (process.env.FRONTEND_ORIGIN || "")
    .split(",").map(s => s.trim()).filter(Boolean);

const allowedOrigins = [...new Set([...envOrigins, ...defaultOrigins])];
const allowedPatterns = [
    /^http:\/\/localhost:\d+$/,      // any localhost port
    /^http:\/\/127\.0\.0\.1:\d+$/,   // any 127.0.0.1 port
];

app.use(cors({
    origin(origin, cb) {
        if (!origin) return cb(null, true); // curl/same-origin navigations
        if (allowedOrigins.includes(origin)) return cb(null, true);
        if (allowedPatterns.some(re => re.test(origin))) return cb(null, true);
        return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: false,
}));
app.options("*", cors());
/* ---------- Core middleware ---------- */
app.set("trust proxy", true); // helpful behind ALB/NGINX if you add later
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan("dev"));
app.use("/public", express.static("public"));

/* ---------- Health ---------- */
app.get("/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

/* ---------- Routers ---------- */
app.use("/auth", authRouter);
app.use("/notes", notesRouter);
app.use("/uploads", uploadRouter);

/* ---------- 404 + errors ---------- */
app.use(notFoundMiddleware);

// Add a small wrapper so presign errors are obvious in clients.
app.use((err, req, res, next) => {
    // Surface common presign problems more clearly
    const msg = String(err?.message || err || "Internal error");
    if (msg.includes("CREDENTIALS_NEAR_EXPIRY")) {
        return res.status(503).json({ error: "CREDENTIALS_NEAR_EXPIRY" });
    }
    if (msg.includes("CORS")) {
        return res.status(403).json({ error: msg });
    }
    // Fall back to your existing error middleware for everything else
    return errorMiddleware(err, req, res, next);
});

/* ---------- Start (with EADDRINUSE fallback) ---------- */
const BASE_PORT = Number(process.env.PORT || 3000);

function listenWithFallback(port, attemptsLeft = 10) {
    const server = http.createServer(app);
    server.on("error", (e) => {
        if (e && (/** @type any */(e)).code === "EADDRINUSE" && attemptsLeft > 0) {
            const nextPort = port + 1;
            console.warn(`Port ${port} in use, trying ${nextPort}...`);
            listenWithFallback(nextPort, attemptsLeft - 1);
        } else {
            console.error("Server failed to start:", e);
            process.exit(1);
        }
    });
    server.listen(port, () => {
        console.log(`SnapNotes API listening on port ${port}`);
        console.log(`Allowed CORS origins: ${allowedOrigins.join(", ") || "(none)"}`);
    });
}

listenWithFallback(BASE_PORT);
