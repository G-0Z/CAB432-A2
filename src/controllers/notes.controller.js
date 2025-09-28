import express from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import * as notes from "../services/dynamo.service.js";
import cache from "../services/cache.service.js";
import { v4 as uuidv4 } from "uuid";

export const router = express.Router();

// Create note metadata
router.post("/", requireAuth, async (req, res, next) => {
    try {
        const { s3Key, caption = "", tags = [] } = req.body || {};
        if (!s3Key) return res.status(400).json({ error: "s3Key required" });

        const noteId = uuidv4();
        const item = await notes.createNote({
            ownerId: req.user.sub,
            noteId,
            s3Key,
            caption,
            tags
        });

        // Invalidate list cache for this user
        await cache.del(`notes:list:${req.user.sub}:*`);
        res.json({ ok: true, item });
    } catch (e) {
        next(e);
    }
});

// List notes (with optional q, tag, limit, cursor)
router.get("/", requireAuth, async (req, res, next) => {
    try {
        const { q = "", tag, limit = 20, cursor } = req.query;
        const cacheKey = `notes:list:${req.user.sub}:${q}:${tag || ""}:${limit}:${cursor || ""}`;

        const cached = await cache.get(cacheKey);
        if (cached) return res.json(JSON.parse(cached));

        const out = await notes.listNotes({
            ownerId: req.user.sub,
            q: String(q),
            tag: tag ? String(tag) : undefined,
            limit: Number(limit),
            cursor: cursor ? String(cursor) : undefined
        });

        await cache.set(cacheKey, JSON.stringify(out), 60); // 60s TTL
        res.json(out);
    } catch (e) {
        next(e);
    }
});

// Get single note
router.get("/:id", requireAuth, async (req, res, next) => {
    try {
        const item = await notes.getNote({ ownerId: req.user.sub, noteId: req.params.id });
        if (!item) return res.status(404).json({ error: "Not found" });
        res.json({ ok: true, item });
    } catch (e) {
        next(e);
    }
});

// Delete note (metadata + optionally object handled by client via presigned)
router.delete("/:id", requireAuth, async (req, res, next) => {
    try {
        await notes.deleteNote({ ownerId: req.user.sub, noteId: req.params.id });
        await cache.del(`notes:list:${req.user.sub}:*`);
        res.json({ ok: true });
    } catch (e) {
        next(e);
    }
});