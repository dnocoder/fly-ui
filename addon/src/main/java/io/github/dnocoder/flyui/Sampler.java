package io.github.dnocoder.flyui;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import net.minecraft.class_1297;
import net.minecraft.class_1309;
import net.minecraft.class_243;
import net.minecraft.class_3218;
import net.minecraft.server.MinecraftServer;

/*
 * Intermediary names used here (yarn name in brackets):
 *   class_1297 [Entity]       method_5667 getUuid, method_5628 getId, method_23317/8/21 getX/Y/Z,
 *                             method_36454 getYaw, method_36455 getPitch, method_18798 getVelocity,
 *                             method_5805 isAlive, method_24828 isOnGround, method_5477 getName,
 *                             method_5864 getType
 *   class_1309 [LivingEntity] method_6032 getHealth, method_6063 getMaxHealth, method_6113 isSleeping
 *   class_3218 [ServerWorld]  method_27909 iterateEntities, method_27983 getRegistryKey, method_8532 getTimeOfDay
 *   MinecraftServer           method_3738 getWorlds, method_30002 getOverworld
 *   class_5321 [RegistryKey]  method_29177 getValue
 *   class_243 [Vec3d]         field_1352/1351/1350 x/y/z
 */

/**
 * Runs on the server thread. Turns the state of every Connectome Fly into a JSON
 * snapshot a few times a second and keeps the latest one for the web server.
 */
final class Sampler {
    private static final String IDLE = "{\"v\":1,\"world\":false,\"flies\":[]}";

    private final Config cfg;
    private final Object lock = new Object();
    private volatile String latest = IDLE;
    private volatile long seq = 0;
    private long tick = 0;

    private final Map<String, WeakReference<class_1297>> flies = new ConcurrentHashMap<>();
    private final Map<String, String> flyDims = new ConcurrentHashMap<>();
    private final Map<String, Long> visionWanted = new ConcurrentHashMap<>();
    private final Map<String, String> visionLatest = new ConcurrentHashMap<>();

    Sampler(Config cfg) { this.cfg = cfg; }

    // ---- called from the server thread -------------------------------------

    void tick(MinecraftServer server) {
        tick++;
        int every = Math.max(1, 20 / cfg.sampleHz);
        if (tick % every == 0) {
            try {
                sample(server);
            } catch (Throwable t) {
                FlyUiMod.logOnce("sample", "snapshot failed: " + t);
            }
        }
        int vEvery = Math.max(1, 20 / cfg.visionHz);
        if (tick % vEvery == 0 && !visionWanted.isEmpty()) {
            try {
                vision(server);
            } catch (Throwable t) {
                FlyUiMod.logOnce("vision", "vision failed: " + t);
            }
        }
    }

    void serverStopped() {
        flies.clear();
        flyDims.clear();
        visionLatest.clear();
        publish(IDLE);
    }

    private void sample(MinecraftServer server) {
        boolean mod = FlyBridge.available();
        Json j = new Json(32768);
        j.beginObject()
                .field("v", 1)
                .field("addon", FlyUiMod.VERSION)
                .field("seq", seq + 1)
                .field("tick", tick)
                .field("ms", System.currentTimeMillis())
                .field("world", true)
                .field("sampleHz", cfg.sampleHz)
                .field("mod", mod)
                .field("modVersion", FlyBridge.modVersion());
        try {
            j.field("timeOfDay", server.method_30002().method_8532() % 24000L);
        } catch (Throwable ignored) {
            // no overworld (shouldn't happen)
        }
        if (mod) {
            j.field("brainsRunning", FlyBridge.brainsRunning());
            j.field("maxBrains", FlyBridge.maxBrains());
        }
        j.key("flies").beginArray();
        Set<String> seen = new HashSet<>();
        if (mod) {
            for (class_3218 world : server.method_3738()) {
                String dim;
                try {
                    dim = world.method_27983().method_29177().toString();
                } catch (Throwable t) {
                    dim = "?";
                }
                for (class_1297 e : world.method_27909()) {
                    if (!FlyBridge.isFly(e)) continue;
                    String id = e.method_5667().toString();
                    seen.add(id);
                    flies.put(id, new WeakReference<>(e));
                    flyDims.put(id, dim);
                    try {
                        j.raw(writeFly(dim, e));
                    } catch (Throwable t) {
                        FlyUiMod.logOnce("fly", "could not read a fly: " + t);
                    }
                }
            }
        }
        flies.keySet().retainAll(seen);
        flyDims.keySet().retainAll(seen);
        visionLatest.keySet().retainAll(seen);
        j.endArray().endObject();
        publish(j.toString());
    }

    private static final String[][] GETTERS = {
            {"hunger", "getHunger"}, {"thirst", "getThirst"}, {"growth", "getGrowth"},
            {"baby", "isBabyFly"}, {"male", "isMale"}, {"flying", "isFlying"},
            {"flapping", "isFlapping"}, {"grooming", "isGrooming"}, {"perched", "isPerched"},
            {"standing", "isStanding"}, {"mating", "isMating"}, {"mated", "hasMated"},
            {"dragged", "isDragged"}, {"noGround", "noGroundBelow"},
            {"neuroLegs", "getNeuroLegs"}, {"neuroFlight", "getNeuroFlight"},
            {"speech", "getSpeech"}, {"bodyMode", "getBodyMode"}, {"animFlags", "animFlags"},
            {"hud", "getHud"}, {"debug", "debugState"},
    };

    private String writeFly(String dim, class_1297 e) {
        Json f = new Json(16384);
        f.beginObject()
                .field("uuid", e.method_5667().toString())
                .field("id", e.method_5628())
                .field("dim", dim)
                .field("x", e.method_23317()).field("y", e.method_23318()).field("z", e.method_23321())
                .field("yaw", e.method_36454()).field("pitch", e.method_36455());
        class_243 vel = e.method_18798();
        f.field("vx", vel.field_1352).field("vy", vel.field_1351).field("vz", vel.field_1350);
        f.field("alive", e.method_5805()).field("onGround", e.method_24828());
        if (e instanceof class_1309) {
            class_1309 le = (class_1309) e;
            f.field("health", le.method_6032()).field("maxHealth", le.method_6063())
                    .field("sleeping", le.method_6113());
        }
        for (String[] g : GETTERS) {
            Object v = Refl.call(e, g[1]);
            if (v instanceof Number) f.field(g[0], ((Number) v).doubleValue());
            else if (v instanceof Boolean) f.field(g[0], (Boolean) v);
            else if (v != null) f.field(g[0], v.toString());
        }

        Object mind = FlyBridge.mind(e);
        Object hudExtra = Refl.call(mind, "hudExtra");
        Object state = Refl.call(mind, "state");
        if (hudExtra != null) f.field("hudExtra", hudExtra.toString());
        if (state != null) f.field("state", state.toString());
        f.field("fleeing", Refl.bool(Refl.call(mind, "fleeing")));
        f.field("drinking", Refl.bool(Refl.call(mind, "isDrinking")));
        f.key("mind");
        Refl.dump(f, mind, null, FlyBridge.MIND_SKIP);
        f.key("entity");
        Refl.dump(f, e, Set.of(FlyBridge.SENSED), FlyBridge.ENTITY_SKIP);

        // whole-brain simulation (158k neurons, own thread)
        Object whole = FlyBridge.wholeBrain(e);
        f.key("brain");
        if (whole == null) {
            f.nul();
        } else {
            f.beginObject();
            f.field("ready", Refl.bool(Refl.call(whole, "ready")));
            f.field("running", Refl.bool(Refl.get(whole, "running")));
            Object label = Refl.get(whole, "label");
            if (label != null) f.field("label", label.toString());
            f.field("compassHeading", Refl.num(Refl.get(whole, "compassHeading"), Double.NaN));
            f.field("compassStrength", Refl.num(Refl.get(whole, "compassStrength"), Double.NaN));
            f.field("pamLP", Refl.num(Refl.get(whole, "pamLP"), Double.NaN));
            f.field("ppl1LP", Refl.num(Refl.get(whole, "ppl1LP"), Double.NaN));
            Object mem = Refl.call(whole, "memory");
            if (mem instanceof float[]) f.array("memory", (float[]) mem);
            Object dopa = Refl.call(whole, "dopamine");
            if (dopa instanceof float[]) f.array("dopamine", (float[]) dopa);
            f.key("loco");
            Refl.dump(f, Refl.call(whole, "loco"), null, null);
            f.endObject();
        }

        // escape + steering circuits (small spiking networks with real cell types)
        Object esc = FlyBridge.escapeBrain(e);
        f.key("intent");
        Refl.dump(f, Refl.get(esc, "intent"), null, null);
        writeNet(f, "escape", FlyBridge.escapeNet(e));
        writeNet(f, "steering", FlyBridge.steeringNet(e));
        Object steering = Refl.get(esc, "steering");
        if (steering != null) {
            f.field("steerLeftMotor", Refl.num(Refl.get(steering, "lastLeftMotor"), 0));
            f.field("steerRightMotor", Refl.num(Refl.get(steering, "lastRightMotor"), 0));
        }

        writeProps(f, e, FlyBridge.props(mind));
        f.endObject();
        return f.toString();
    }

    private static void writeNet(Json f, String name, Object net) {
        if (net == null) return;
        Object v = Refl.get(net, "v");
        Object spiked = Refl.get(net, "spiked");
        f.key(name).beginObject();
        if (v instanceof double[]) {
            double[] dv = (double[]) v;
            f.key("v").beginArray();
            for (double d : dv) f.value(Math.round(d * 1000) / 1000.0);
            f.endArray();
        }
        if (spiked instanceof boolean[]) {
            boolean[] s = (boolean[]) spiked;
            f.key("spiked").beginArray();
            for (int i = 0; i < s.length; i++) if (s[i]) f.value(i);
            f.endArray();
        }
        f.endObject();
    }

    private static void writeProps(Json f, class_1297 fly, List<Object> props) {
        if (props == null) return;
        List<Object> copy;
        try {
            copy = new ArrayList<>(props);
        } catch (RuntimeException ex) {
            return;
        }
        double fx = fly.method_23317(), fy = fly.method_23318(), fz = fly.method_23321();
        f.key("props").beginArray();
        for (Object p : copy) {
            Object kind = Refl.get(p, "kind");
            if (kind == null) continue;
            double x = Refl.num(Refl.get(p, "x"), Double.NaN);
            double y = Refl.num(Refl.get(p, "y"), Double.NaN);
            double z = Refl.num(Refl.get(p, "z"), Double.NaN);
            f.beginObject().field("kind", kind.toString())
                    .field("x", x).field("y", y).field("z", z)
                    .field("dx", x - fx).field("dy", y - fy).field("dz", z - fz);
            if (Refl.bool(Refl.get(p, "fruit"))) f.field("fruit", true);
            if (Refl.bool(Refl.get(p, "cauldron"))) f.field("cauldron", true);
            Object info = Refl.get(p, "info");
            if (info != null) {
                Object effect = Refl.call(info, "effect");
                Object ch = Refl.call(info, "ch");
                Object act = Refl.call(info, "act");
                if (effect != null) f.field("effect", effect.toString());
                if (ch != null) f.field("channel", ch.toString());
                if (act != null) f.field("act", act.toString());
            }
            Object ent = Refl.get(p, "ent");
            if (ent instanceof class_1297) f.field("entity", Vision.entityName((class_1297) ent));
            f.endObject();
        }
        f.endArray();
    }

    private void vision(MinecraftServer server) {
        long now = System.currentTimeMillis();
        visionWanted.values().removeIf(t -> now - t > 3000);
        for (String id : visionWanted.keySet()) {
            class_1297 fly = fly(id);
            if (fly == null || !(fly.method_37908() instanceof class_3218)) continue;
            visionLatest.put(id, Vision.compute((class_3218) fly.method_37908(), fly, cfg, tick));
        }
    }

    private void publish(String json) {
        synchronized (lock) {
            latest = json;
            seq++;
            lock.notifyAll();
        }
    }

    // ---- called from web threads -------------------------------------------

    String latest() { return latest; }

    long seq() { return seq; }

    /** Blocks until a snapshot newer than {@code after} exists or the timeout passes. */
    long awaitNewer(long after, long timeoutMs) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMs;
        synchronized (lock) {
            while (seq <= after) {
                long left = deadline - System.currentTimeMillis();
                if (left <= 0) break;
                lock.wait(left);
            }
            return seq;
        }
    }

    /** The fly with this UUID, or the first known fly if uuid is null/blank. */
    class_1297 fly(String uuid) {
        if (uuid == null || uuid.isBlank()) {
            for (WeakReference<class_1297> r : flies.values()) {
                class_1297 e = r.get();
                if (e != null) return e;
            }
            return null;
        }
        WeakReference<class_1297> r = flies.get(uuid);
        return r == null ? null : r.get();
    }

    void wantVision(String uuid) {
        if (uuid != null && flies.containsKey(uuid)) visionWanted.put(uuid, System.currentTimeMillis());
    }

    String vision(String uuid) { return uuid == null ? null : visionLatest.get(uuid); }
}
