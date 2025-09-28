// src/controllers/upload.controller.js
import express from "express";
import crypto from "node:crypto";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import { requireAuth } from "../middleware/auth.middleware.js";
import { getPresignedUpload, getPresignedDownload } from "../services/s3.service.js";

export const router = express.Router();

/* ---------- S3 (for direct uploads) ---------- */
const REGION = process.env.AWS_REGION || "ap-southeast-2";
const BUCKET = process.env.S3_BUCKET;
const s3 = new S3Client({ region: REGION });

/* ---------- Multer (in-memory) ---------- */
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

/* ---------- Helpers ---------- */
function sanitizeFilename(name) {
    const base = (name || "").split(/[\\/]/).pop() || "file";
    return base.replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(0, 180);
}
function makeS3Key({ userId, filename }) {
    const uuid = crypto.randomUUID();
    const safe = sanitizeFilename(filename);
    return `${userId}/${uuid}-${safe}`;
}

/* ---------- Optional tiny health for this router ---------- */
router.get("/health", (_req, res) => res.json({ ok: true, router: "uploads" }));

/* ---------- Routes ---------- */

// /uploads/presign  (browser -> S3 PUT)
router.post("/presign", requireAuth, async (req, res, next) => {
    try {
        const { filename } = req.body || {};
        const contentType = req.body?.contentType || "application/octet-stream"; // default so blank types still work
        if (!filename) {
            return res.status(400).json({ ok: false, error: "filename required" });
        }

        const userId = req.user?.sub || req.user?.id || "anonymous";
        const key = makeS3Key({ userId, filename });
        const out = await getPresignedUpload({ key, contentType });

        return res.json({
            ok: true,
            key, // always top-level
            upload: {
                method: "PUT",
                url: out.url,
                headers: out.headers,        // e.g. { "Content-Type": "image/png" }
                expiresIn: out.expiresIn,    // seconds
            },
        });
    } catch (e) { next(e); }
});

// /uploads/direct  (server-proxy; no S3 PUT in browser)
router.post("/direct", requireAuth, upload.single("file"), async (req, res, next) => {
    try {
        if (!BUCKET) return res.status(500).json({ ok: false, error: "S3_BUCKET not set" });
        if (!req.file) return res.status(400).json({ ok: false, error: "file required (field 'file')" });

        const userId = req.user?.sub || req.user?.id || "anonymous";
        const baseKey = makeS3Key({ userId, filename: req.file.originalname });
        const folder = (req.body?.folder || "").replace(/^\/+|\/+$/g, "");
        const key = folder ? `${folder}/${baseKey}` : baseKey;

        const out = await s3.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype || "application/octet-stream",
        }));

        return res.json({
            ok: true,
            key,           // always top-level
            eTag: out.ETag,
            size: req.file.size,
            mime: req.file.mimetype,
        });
    } catch (e) { next(e); }
});

// /uploads/download  (presigned GET for private objects)
router.post("/download", requireAuth, async (req, res, next) => {
    try {
        const { s3Key, filename: asFilename, contentType } = req.body || {};
        if (!s3Key) return res.status(400).json({ ok: false, error: "s3Key required" });

        const out = await getPresignedDownload({ key: s3Key, asFilename, contentType });
        return res.json({
            ok: true,
            key: s3Key,
            download: { url: out.url, expiresIn: out.expiresIn },
        });
    } catch (e) { next(e); }
});
