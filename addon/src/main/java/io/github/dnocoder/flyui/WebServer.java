package io.github.dnocoder.flyui;

import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

import net.minecraft.class_1297;

/**
 * A deliberately small HTTP/1.1 server (GET only, one request per connection,
 * plus a Server-Sent Events stream). Using java.net directly keeps the addon free
 * of dependencies and independent of which JDK modules the game's Java runtime ships.
 */
final class WebServer {
    private static final int MAX_SSE = 16;

    private final Config cfg;
    private final Sampler sampler;
    private final AtomicInteger sseOpen = new AtomicInteger();
    private final Map<String, byte[]> circuitCache = new ConcurrentHashMap<>();
    private ServerSocket socket;
    private ExecutorService pool;
    private volatile int port = -1;

    WebServer(Config cfg, Sampler sampler) {
        this.cfg = cfg;
        this.sampler = sampler;
    }

    int port() { return port; }

    String url() {
        String host = "0.0.0.0".equals(cfg.bind) ? "127.0.0.1" : cfg.bind;
        return "http://" + host + ":" + port + "/";
    }

    /** Binds to the configured port, or the next free one of the following nine. */
    boolean start() {
        InetAddress addr;
        try {
            addr = InetAddress.getByName(cfg.bind);
        } catch (IOException e) {
            FlyUiMod.log("bad bind address '" + cfg.bind + "': " + e);
            return false;
        }
        for (int p = cfg.port; p < cfg.port + 10 && p <= 65535; p++) {
            try {
                ServerSocket s = new ServerSocket();
                s.setReuseAddress(true);
                s.bind(new InetSocketAddress(addr, p), 64);
                socket = s;
                port = p;
                break;
            } catch (IOException e) {
                // try the next port
            }
        }
        if (socket == null) {
            FlyUiMod.log("no free port in " + cfg.port + ".." + (cfg.port + 9) + "; web page disabled");
            return false;
        }
        AtomicInteger n = new AtomicInteger();
        pool = Executors.newCachedThreadPool(r -> {
            Thread t = new Thread(r, "flyui-http-" + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        });
        Thread accept = new Thread(this::acceptLoop, "flyui-accept");
        accept.setDaemon(true);
        accept.start();
        FlyUiMod.log("web page at " + url());
        return true;
    }

    private void acceptLoop() {
        while (!socket.isClosed()) {
            try {
                Socket s = socket.accept();
                pool.execute(() -> handle(s));
            } catch (IOException e) {
                if (socket.isClosed()) return;
            } catch (RuntimeException e) {
                FlyUiMod.logOnce("accept", "accept failed: " + e);
            }
        }
    }

    private void handle(Socket s) {
        try (Socket sock = s) {
            sock.setSoTimeout(15000);
            sock.setTcpNoDelay(true);
            InputStream in = sock.getInputStream();
            String requestLine = readLine(in);
            if (requestLine == null || requestLine.isEmpty()) return;
            String line;
            int headerCount = 0;
            while ((line = readLine(in)) != null && !line.isEmpty()) {
                if (++headerCount > 100) return;
            }
            String[] parts = requestLine.split(" ");
            if (parts.length < 2) return;
            OutputStream out = new BufferedOutputStream(sock.getOutputStream(), 65536);
            String method = parts[0];
            String target = parts[1];
            if ("OPTIONS".equals(method)) {
                writeHead(out, 204, "No Content", null, 0, true);
                out.flush();
                return;
            }
            if (!"GET".equals(method) && !"HEAD".equals(method)) {
                sendText(out, 405, "Method Not Allowed", "text/plain", "GET only");
                return;
            }
            int q = target.indexOf('?');
            String path = q >= 0 ? target.substring(0, q) : target;
            Map<String, String> query = parseQuery(q >= 0 ? target.substring(q + 1) : "");
            route(out, path, query);
        } catch (IOException e) {
            // client went away
        } catch (Throwable t) {
            FlyUiMod.logOnce("http", "request failed: " + t);
        }
    }

    private void route(OutputStream out, String path, Map<String, String> q) throws IOException {
        switch (path) {
            case "/api/hello": {
                Json j = new Json();
                j.beginObject().field("addon", "flyui").field("version", FlyUiMod.VERSION)
                        .field("mod", FlyBridge.available()).field("modVersion", FlyBridge.modVersion())
                        .field("port", port).field("sampleHz", cfg.sampleHz).endObject();
                sendJson(out, 200, j.toString());
                return;
            }
            case "/api/state":
                sendJson(out, 200, sampler.latest());
                return;
            case "/api/stream":
                stream(out);
                return;
            case "/api/meta": {
                if (!FlyBridge.available()) { error(out, 503, "Connectome Fly mod is not installed"); return; }
                String m = BrainApi.meta();
                if (m == null) error(out, 503, "brain data not available yet");
                else sendJson(out, 200, m);
                return;
            }
            case "/api/activity": {
                class_1297 fly = sampler.fly(q.get("fly"));
                if (fly == null) { error(out, 404, "no such fly"); return; }
                byte[] b = BrainApi.activity(fly, q.getOrDefault("kind", "rate"));
                if (b == null) { error(out, 503, "brain not running"); return; }
                writeHead(out, 200, "OK", "application/octet-stream", b.length, false);
                out.write(b);
                out.flush();
                return;
            }
            case "/api/vision": {
                String id = q.get("fly");
                class_1297 fly = sampler.fly(id);
                if (fly == null) { error(out, 404, "no such fly"); return; }
                id = fly.method_5667().toString();
                sampler.wantVision(id);
                String v = sampler.vision(id);
                if (v == null) sendJson(out, 202, "{\"pending\":true}");
                else sendJson(out, 200, v);
                return;
            }
            case "/api/net": {
                class_1297 fly = sampler.fly(q.get("fly"));
                if (fly == null) { error(out, 404, "no such fly"); return; }
                String n = BrainApi.netNodes(fly, q.getOrDefault("name", "escape"));
                if (n == null) error(out, 404, "circuit not running");
                else sendJson(out, 200, n);
                return;
            }
            case "/api/circuit": {
                String name = "steering".equals(q.get("name")) ? "steering_circuit.json" : "circuit.json";
                byte[] b = circuitCache.get(name);
                if (b == null) {
                    b = FlyBridge.modResource("data/connectomefly/" + name);
                    if (b != null) circuitCache.put(name, b);
                }
                if (b == null) { error(out, 404, "circuit file not found in the Connectome Fly jar"); return; }
                writeHead(out, 200, "OK", "application/json; charset=utf-8", b.length, false);
                out.write(b);
                out.flush();
                return;
            }
            default:
                if (path.startsWith("/api/")) { error(out, 404, "unknown endpoint"); return; }
                staticFile(out, path);
        }
    }

    private void stream(OutputStream out) throws IOException {
        if (sseOpen.incrementAndGet() > MAX_SSE) {
            sseOpen.decrementAndGet();
            error(out, 503, "too many open streams");
            return;
        }
        try {
            String head = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: text/event-stream; charset=utf-8\r\n"
                    + "Cache-Control: no-cache\r\n"
                    + "Connection: keep-alive\r\n"
                    + "Access-Control-Allow-Origin: *\r\n"
                    + "X-Accel-Buffering: no\r\n\r\n";
            out.write(head.getBytes(StandardCharsets.US_ASCII));
            out.write("retry: 2000\n\n".getBytes(StandardCharsets.US_ASCII));
            long seen = sampler.seq();
            sendEvent(out, sampler.latest());
            while (true) {
                long now = sampler.awaitNewer(seen, 15000);
                if (now == seen) {
                    out.write(": ping\n\n".getBytes(StandardCharsets.US_ASCII));
                    out.flush();
                } else {
                    seen = now;
                    sendEvent(out, sampler.latest());
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        } finally {
            sseOpen.decrementAndGet();
        }
    }

    private static void sendEvent(OutputStream out, String json) throws IOException {
        out.write("data: ".getBytes(StandardCharsets.US_ASCII));
        out.write(json.getBytes(StandardCharsets.UTF_8));
        out.write("\n\n".getBytes(StandardCharsets.US_ASCII));
        out.flush();
    }

    private static final Map<String, String> TYPES = new HashMap<>();

    static {
        TYPES.put("html", "text/html; charset=utf-8");
        TYPES.put("js", "text/javascript; charset=utf-8");
        TYPES.put("mjs", "text/javascript; charset=utf-8");
        TYPES.put("css", "text/css; charset=utf-8");
        TYPES.put("json", "application/json; charset=utf-8");
        TYPES.put("svg", "image/svg+xml");
        TYPES.put("png", "image/png");
        TYPES.put("ico", "image/x-icon");
        TYPES.put("woff2", "font/woff2");
        TYPES.put("txt", "text/plain; charset=utf-8");
    }

    private void staticFile(OutputStream out, String path) throws IOException {
        String p = URLDecoder.decode(path, StandardCharsets.UTF_8);
        if (p.contains("..") || p.contains("\\")) { error(out, 400, "bad path"); return; }
        if (p.endsWith("/")) p = p + "index.html";
        InputStream res = WebServer.class.getResourceAsStream("/web" + p);
        if (res == null) { sendText(out, 404, "Not Found", "text/plain", "not found"); return; }
        byte[] body;
        try (InputStream r = res) {
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            r.transferTo(buf);
            body = buf.toByteArray();
        }
        int dot = p.lastIndexOf('.');
        String type = TYPES.getOrDefault(dot >= 0 ? p.substring(dot + 1) : "", "application/octet-stream");
        writeHead(out, 200, "OK", type, body.length, false);
        out.write(body);
        out.flush();
    }

    private static void error(OutputStream out, int code, String msg) throws IOException {
        Json j = new Json(128);
        j.beginObject().field("error", msg).endObject();
        sendJson(out, code, j.toString());
    }

    private static void sendJson(OutputStream out, int code, String json) throws IOException {
        byte[] b = json.getBytes(StandardCharsets.UTF_8);
        writeHead(out, code, reason(code), "application/json; charset=utf-8", b.length, false);
        out.write(b);
        out.flush();
    }

    private static void sendText(OutputStream out, int code, String reason, String type, String text) throws IOException {
        byte[] b = text.getBytes(StandardCharsets.UTF_8);
        writeHead(out, code, reason, type + "; charset=utf-8", b.length, false);
        out.write(b);
        out.flush();
    }

    private static void writeHead(OutputStream out, int code, String reason, String type, long length,
                                  boolean preflight) throws IOException {
        StringBuilder h = new StringBuilder(256);
        h.append("HTTP/1.1 ").append(code).append(' ').append(reason).append("\r\n");
        if (type != null) h.append("Content-Type: ").append(type).append("\r\n");
        h.append("Content-Length: ").append(length).append("\r\n");
        h.append("Cache-Control: no-cache\r\n");
        h.append("Connection: close\r\n");
        h.append("Access-Control-Allow-Origin: *\r\n");
        if (preflight) {
            h.append("Access-Control-Allow-Methods: GET, OPTIONS\r\n");
            h.append("Access-Control-Allow-Headers: *\r\n");
            h.append("Access-Control-Allow-Private-Network: true\r\n");
            h.append("Access-Control-Max-Age: 600\r\n");
        }
        h.append("\r\n");
        out.write(h.toString().getBytes(StandardCharsets.US_ASCII));
    }

    private static String reason(int code) {
        switch (code) {
            case 200: return "OK";
            case 202: return "Accepted";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 503: return "Service Unavailable";
            default: return "Status";
        }
    }

    private static String readLine(InputStream in) throws IOException {
        StringBuilder sb = new StringBuilder(128);
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') sb.append((char) c);
            if (sb.length() > 8192) return null;
        }
        if (c == -1 && sb.length() == 0) return null;
        return sb.toString();
    }

    private static Map<String, String> parseQuery(String qs) {
        Map<String, String> m = new HashMap<>();
        for (String pair : qs.split("&")) {
            if (pair.isEmpty()) continue;
            int eq = pair.indexOf('=');
            String k = eq >= 0 ? pair.substring(0, eq) : pair;
            String v = eq >= 0 ? pair.substring(eq + 1) : "";
            m.put(URLDecoder.decode(k, StandardCharsets.UTF_8), URLDecoder.decode(v, StandardCharsets.UTF_8));
        }
        return m;
    }
}
