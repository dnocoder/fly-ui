package io.github.dnocoder.flyui;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Optional;
import java.util.Set;

import net.fabricmc.loader.api.FabricLoader;
import net.fabricmc.loader.api.ModContainer;

/**
 * Everything Fly UI knows about the internals of the Connectome Fly mod
 * (io.flyproject.connectomefly, tested with 1.0.0). All access is by name through
 * reflection, so no code from that mod is compiled into this addon. When the mod
 * is missing or a name changes, the affected values simply come back as null.
 */
final class FlyBridge {
    static final String MOD_ID = "connectomefly";
    private static final String PKG = "io.flyproject.connectomefly.";
    static final String ENTITY = PKG + "entity.ConnectomeFlyEntity";
    static final String WHOLE_BRAIN = PKG + "neural.WholeBrain";
    static final String LOCO = PKG + "neural.WholeBrain$Loco";
    static final String SENSED = PKG + "neural.EscapeBrain$Sensed";
    static final String INTENT = PKG + "neural.EscapeBrain$Intent";
    static final String INFO = PKG + "entity.FlyMind$Info";

    /** Fields of FlyMind / the entity that are not plain values or are already exported elsewhere. */
    static final Set<String> MIND_SKIP = Set.of("blockProps", "lastBrain", "lastLoco", "lastLocoBout",
            "feeding", "plumeSrc", "lastBearing", "outSmooth");
    static final Set<String> ENTITY_SKIP = Set.of("speechRandom", "lastCategoryTick", "chanSmooth", "perchTarget");

    private static Class<?> entityClass;
    private static Class<?> wholeBrainClass;
    private static boolean resolved;

    private FlyBridge() {}

    static synchronized void resolve() {
        if (resolved) return;
        resolved = true;
        if (!FabricLoader.getInstance().isModLoaded(MOD_ID)) return;
        ClassLoader cl = FlyBridge.class.getClassLoader();
        try {
            entityClass = Class.forName(ENTITY, false, cl);
            wholeBrainClass = Class.forName(WHOLE_BRAIN, false, cl);
        } catch (Throwable t) {
            FlyUiMod.log("Connectome Fly is loaded but its classes were not found: " + t);
            entityClass = null;
            wholeBrainClass = null;
        }
    }

    static boolean available() {
        resolve();
        return entityClass != null;
    }

    static String modVersion() {
        return FabricLoader.getInstance().getModContainer(MOD_ID)
                .map(c -> c.getMetadata().getVersion().getFriendlyString()).orElse(null);
    }

    static boolean isFly(Object entity) {
        return entityClass != null && entityClass.isInstance(entity);
    }

    static Class<?> entityClass() { return entityClass; }

    static Class<?> wholeBrainClass() { return wholeBrainClass; }

    // ---- per-fly accessors -------------------------------------------------

    static Object mind(Object fly) { return Refl.call(fly, "mind"); }

    static Object wholeBrain(Object fly) { return Refl.call(fly, "wholeBrain"); }

    static Object escapeBrain(Object fly) { return Refl.get(fly, "brain"); }

    /** The LifNetwork of the giant-fibre escape circuit, or null. */
    static Object escapeNet(Object fly) {
        return Refl.get(Refl.get(escapeBrain(fly), "escape"), "net");
    }

    /** The LifNetwork of the VNC steering circuit, or null. */
    static Object steeringNet(Object fly) {
        return Refl.get(Refl.get(escapeBrain(fly), "steering"), "net");
    }

    @SuppressWarnings("unchecked")
    static List<Object> props(Object mind) {
        Object o = Refl.get(mind, "blockProps");
        return o instanceof List ? (List<Object>) o : null;
    }

    static boolean isThreat(Object entity) {
        if (entityClass == null || entity == null) return false;
        Object r = Refl.callStatic(entityClass, "isThreat",
                new Class<?>[]{net.minecraft.class_1297.class}, entity);
        return Refl.bool(r);
    }

    static String threatName(Object entity) {
        if (entityClass == null || entity == null) return null;
        Object r = Refl.callStatic(entityClass, "threatName",
                new Class<?>[]{net.minecraft.class_1297.class}, entity);
        return r == null ? null : r.toString();
    }

    static int brainsRunning() {
        return (int) Refl.num(Refl.callStatic(wholeBrainClass, "running", new Class<?>[0]), -1);
    }

    static int maxBrains() {
        return (int) Refl.num(Refl.getStatic(entityClass, "maxBrains"), -1);
    }

    /** WholeBrain.data(): the shared connectome (loads it if no fly has yet). */
    static Object brainData() {
        return Refl.callStatic(wholeBrainClass, "data", new Class<?>[0]);
    }

    /** Raw bytes of a resource inside the Connectome Fly jar, e.g. "data/connectomefly/circuit.json". */
    static byte[] modResource(String path) throws IOException {
        Optional<ModContainer> c = FabricLoader.getInstance().getModContainer(MOD_ID);
        if (c.isEmpty()) return null;
        Optional<Path> p = c.get().findPath(path);
        if (p.isEmpty()) return null;
        return Files.readAllBytes(p.get());
    }
}
