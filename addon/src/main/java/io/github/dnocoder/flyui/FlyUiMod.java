package io.github.dnocoder.flyui;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerTickEvents;
import net.fabricmc.fabric.api.networking.v1.ServerPlayConnectionEvents;
import net.minecraft.class_124;
import net.minecraft.class_2558;
import net.minecraft.class_2561;
import net.minecraft.class_5250;

/*
 * Intermediary names used here (yarn name in brackets):
 *   class_2561 [Text] method_43470 literal; class_5250 [MutableText] method_27692 formatted,
 *   method_10852 append, method_27694 styled; class_2583 [Style] method_10958 withClickEvent,
 *   method_30938 withUnderline; class_2558 [ClickEvent], class_2559.field_11749 = OPEN_URL;
 *   class_124 [Formatting] field_1075 = AQUA, field_1080 = GRAY;
 *   class_3244 [ServerPlayNetworkHandler] field_14140 player; class_3222#method_43496 sendMessage
 */

/**
 * Fly UI: a live web dashboard for the Connectome Fly mod.
 * Starts a small local web server when the game starts and samples every fly on
 * the (integrated or dedicated) server a few times per second.
 */
public final class FlyUiMod implements ModInitializer {
    public static final String VERSION = "0.1.0";

    private static final Set<String> LOGGED = ConcurrentHashMap.newKeySet();

    private Sampler sampler;
    private WebServer web;

    @Override
    public void onInitialize() {
        Config cfg = Config.load();
        sampler = new Sampler(cfg);
        web = new WebServer(cfg, sampler);
        boolean up = web.start();
        if (!FlyBridge.available()) {
            log("Connectome Fly (" + FlyBridge.MOD_ID + ") is not installed: the page will open but stay empty");
        }

        ServerTickEvents.END_SERVER_TICK.register(server -> sampler.tick(server));
        ServerLifecycleEvents.SERVER_STOPPED.register(server -> sampler.serverStopped());

        if (up && cfg.chatLink) {
            ServerPlayConnectionEvents.JOIN.register((handler, sender, server) -> {
                try {
                    String url = web.url();
                    class_5250 msg = class_2561.method_43470("[Fly UI] ").method_27692(class_124.field_1075)
                            .method_10852(class_2561.method_43470("brain dashboard: ").method_27692(class_124.field_1080))
                            .method_10852(class_2561.method_43470(url).method_27694(s -> s
                                    .method_10958(new class_2558(class_2558.class_2559.field_11749, url))
                                    .method_30938(true)));
                    handler.field_14140.method_43496(msg);
                } catch (Throwable t) {
                    logOnce("chat", "could not post the link in chat: " + t);
                }
            });
        }
    }

    static void log(String msg) {
        System.out.println("[flyui] " + msg);
    }

    /** Logs a message only the first time a given key is seen, to keep per-tick failures out of the log. */
    static void logOnce(String key, String msg) {
        if (LOGGED.add(key)) log(msg + " (further errors of this kind are not logged)");
    }
}
