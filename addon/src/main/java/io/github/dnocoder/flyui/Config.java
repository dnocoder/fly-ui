package io.github.dnocoder.flyui;

import java.io.IOException;
import java.io.Reader;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

import net.fabricmc.loader.api.FabricLoader;

/** Settings from {@code config/flyui.properties}; the file is created on first run. */
final class Config {
    String bind = "127.0.0.1";
    int port = 8765;
    /** Snapshots per second sent to the web page (1..20). */
    int sampleHz = 10;
    /** Vision frames per second for the fly being watched (1..20). */
    int visionHz = 4;
    int visionWidth = 64;
    int visionHeight = 28;
    int visionRange = 32;
    /** Post a clickable link in chat when a player joins a world. */
    boolean chatLink = true;

    static Config load() {
        Config c = new Config();
        Path file = FabricLoader.getInstance().getConfigDir().resolve("flyui.properties");
        Properties p = new Properties();
        if (Files.exists(file)) {
            try (Reader r = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                p.load(r);
            } catch (IOException e) {
                FlyUiMod.log("could not read " + file + ": " + e);
            }
        }
        c.bind = p.getProperty("bind", c.bind).trim();
        c.port = clamp(intProp(p, "port", c.port), 1, 65535);
        c.sampleHz = clamp(intProp(p, "sampleHz", c.sampleHz), 1, 20);
        c.visionHz = clamp(intProp(p, "visionHz", c.visionHz), 1, 20);
        c.visionWidth = clamp(intProp(p, "visionWidth", c.visionWidth), 8, 160);
        c.visionHeight = clamp(intProp(p, "visionHeight", c.visionHeight), 4, 80);
        c.visionRange = clamp(intProp(p, "visionRange", c.visionRange), 4, 96);
        c.chatLink = Boolean.parseBoolean(p.getProperty("chatLink", String.valueOf(c.chatLink)).trim());
        if (!Files.exists(file)) c.save(file);
        return c;
    }

    private void save(Path file) {
        String text = String.join("\n",
                "# Fly UI settings. Restart the game after editing.",
                "# Address the web page listens on. Keep 127.0.0.1 unless you know why you need otherwise:",
                "# 0.0.0.0 would expose the page to your whole network.",
                "bind=" + bind,
                "port=" + port,
                "# Snapshots per second (1-20)",
                "sampleHz=" + sampleHz,
                "# Vision ray grid for the fly you are watching. Bigger grids cost more server time.",
                "visionHz=" + visionHz,
                "visionWidth=" + visionWidth,
                "visionHeight=" + visionHeight,
                "visionRange=" + visionRange,
                "# Show a clickable link in chat when you join a world",
                "chatLink=" + chatLink,
                "");
        try {
            Files.createDirectories(file.getParent());
            try (Writer w = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                w.write(text);
            }
        } catch (IOException e) {
            FlyUiMod.log("could not write " + file + ": " + e);
        }
    }

    private static int intProp(Properties p, String key, int def) {
        try {
            return Integer.parseInt(p.getProperty(key, String.valueOf(def)).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }
}
