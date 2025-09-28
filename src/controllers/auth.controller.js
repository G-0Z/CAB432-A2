import express from "express";
import { signup, confirmSignup, login } from "../services/cognito.service.js";

export const router = express.Router();

/**
 * POST /auth/signup
 * Body: { username, email, password }
 */
router.post("/signup", async (req, res, next) => {
    try {
        const { username, email, password } = req.body || {};
        const out = await signup({ username, email, password });
        res.json({ ok: true, data: out });
    } catch (e) {
        next(e);
    }
});

/**
 * POST /auth/confirm
 * Body: { username, code }
 */
router.post("/confirm", async (req, res, next) => {
    try {
        const { username, code } = req.body || {};
        const out = await confirmSignup({ username, code });
        res.json({ ok: true, data: out });
    } catch (e) {
        next(e);
    }
});

/**
 * POST /auth/login
 * Body: { username, password }
 */
router.post("/login", async (req, res, next) => {
    try {
        const { username, password } = req.body || {};
        const out = await login({ username, password });
        res.json({ ok: true, ...out });
    } catch (e) {
        next(e);
    }
});
