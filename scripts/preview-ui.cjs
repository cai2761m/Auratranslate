// Local preview only: browser APIs and provider requests use synthetic data.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
function createPreviewServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }
    let file =
      url.pathname === "/" ? "options/options.html" : url.pathname.slice(1);
    if (file === "preview.js") file = "scripts/preview-ui-browser.js";
    if (
      !/^(?:(?:options|popup)\/(?:options|popup)\.(?:html|css|js)|ui\/shared\/theme(?:\.css|-boot\.js)|icons\/icon(?:-\d+\.png|\.svg)|src\/shared(?:-[a-z]+)?\.js|scripts\/preview-ui-browser\.js)$/.test(
        file,
      )
    ) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      let content = fs.readFileSync(path.join(root, file));
      if (file.endsWith(".html"))
        content = content
          .toString()
          .replace(
            '<script src="../src/shared-settings.js">',
            '<script src="/preview.js"></script>\n<script src="../src/shared-settings.js">',
          );
      res.writeHead(200, {
        "Content-Type": file.endsWith(".html")
          ? "text/html; charset=utf-8"
          : file.endsWith(".css")
            ? "text/css"
            : file.endsWith(".svg")
              ? "image/svg+xml"
              : file.endsWith(".png")
                ? "image/png"
                : "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": "script-src 'self'; object-src 'self'",
      });
      res.end(content);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
}
module.exports = { createPreviewServer };
if (require.main === module) {
  const server = createPreviewServer();
  server.listen(Number(process.env.UI_PREVIEW_PORT || 5174), "127.0.0.1", () =>
    console.log(
      `Mock UI preview: http://127.0.0.1:${server.address().port}/options/options.html and /popup/popup.html`,
    ),
  );
}
