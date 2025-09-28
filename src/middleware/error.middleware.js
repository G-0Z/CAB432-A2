export function notFoundMiddleware(_req, res, _next) {
    res.status(404).json({ error: "Not found" });
}

export function errorMiddleware(err, _req, res, _next) {
    console.error(err);
    res.status(err.status || 500).json({
        error: err.message || "Internal Server Error"
    });
}
