package io.github.dnocoder.flyui;

import java.util.Base64;

import net.minecraft.class_1297;

/**
 * Whole-brain data for the web page: the static connectome layout (which neurons
 * belong to which sensory channel / motor output) and live per-neuron activity.
 */
final class BrainApi {
    private static volatile String metaCache;

    private BrainApi() {}

    /** Connectome metadata, cached after the first call. Null if the brain data could not be loaded. */
    static String meta() {
        String m = metaCache;
        if (m != null) return m;
        synchronized (BrainApi.class) {
            if (metaCache != null) return metaCache;
            Object d = FlyBridge.brainData();
            if (d == null) return null;
            Json j = new Json(1 << 20);
            Base64.Encoder b64 = Base64.getEncoder();
            j.beginObject();
            j.field("n", Refl.num(Refl.get(d, "n"), 0));
            j.field("nEdges", Refl.num(Refl.get(d, "nEdges"), 0));
            j.field("nPlastic", Refl.num(Refl.get(d, "nPlastic"), 0));
            Object note = Refl.get(d, "circuitGainNote");
            if (note != null) j.field("circuitGainNote", note.toString());
            stringArray(j, "chanNames", Refl.get(d, "chanNames"));
            intMatrix(j, "chanIdx", Refl.get(d, "chanIdx"));
            stringArray(j, "outNames", Refl.get(d, "outNames"));
            stringArray(j, "outLabels", Refl.get(d, "outLabels"));
            intMatrix(j, "outIdx", Refl.get(d, "outIdx"));
            Object epgIdx = Refl.get(d, "epgIdx");
            if (epgIdx instanceof int[]) j.array("epgIdx", (int[]) epgIdx);
            Object epgAngle = Refl.get(d, "epgAngle");
            if (epgAngle instanceof float[]) j.array("epgAngle", (float[]) epgAngle);
            bytes(j, b64, "sensory", Refl.get(d, "sensory"));
            bytes(j, b64, "dnclass", Refl.get(d, "dnclass"));
            bytes(j, b64, "mbonClass", Refl.get(d, "mbonClass"));
            bytes(j, b64, "neuronChan", Refl.get(d, "neuronChan"));
            Object kc = Refl.get(d, "isKC");
            if (kc instanceof boolean[]) {
                boolean[] b = (boolean[]) kc;
                byte[] out = new byte[b.length];
                for (int i = 0; i < b.length; i++) out[i] = (byte) (b[i] ? 1 : 0);
                j.field("isKC", b64.encodeToString(out));
            }
            j.endObject();
            metaCache = j.toString();
            return metaCache;
        }
    }

    /**
     * One byte per neuron.
     * kind=rate: the brain's spike-adaptation trace a[i] (rises 0.4 per spike, decays with
     *   a 250 ms time constant), so firing rate in Hz is about 10*a. Encoded as min(255, a*32),
     *   i.e. Hz ~= byte * 0.3125. Sensory neurons do not adapt and read 0 here.
     * kind=v: membrane potential, threshold 1, reset 0. Encoded as clamp((v+0.5)/1.5)*255.
     */
    static byte[] activity(class_1297 fly, String kind) {
        Object whole = FlyBridge.wholeBrain(fly);
        if (whole == null) return null;
        boolean volt = "v".equals(kind);
        Object arr = Refl.get(whole, volt ? "v" : "a");
        if (!(arr instanceof float[])) return null;
        float[] a = (float[]) arr;
        byte[] out = new byte[a.length];
        if (volt) {
            for (int i = 0; i < a.length; i++) {
                float x = (a[i] + 0.5f) / 1.5f;
                out[i] = (byte) Math.round(Math.max(0f, Math.min(1f, x)) * 255f);
            }
        } else {
            for (int i = 0; i < a.length; i++) {
                out[i] = (byte) Math.min(255, Math.round(a[i] * 32f));
            }
        }
        return out;
    }

    /** Node order of the fly's escape or steering LifNetwork (ids, cell types, roles, sides). */
    static String netNodes(class_1297 fly, String name) {
        Object net = "steering".equals(name) ? FlyBridge.steeringNet(fly) : FlyBridge.escapeNet(fly);
        if (net == null) return null;
        Json j = new Json(65536);
        j.beginObject();
        stringArray(j, "ids", Refl.get(net, "ids"));
        stringArray(j, "cellType", Refl.get(net, "cellType"));
        stringArray(j, "role", Refl.get(net, "role"));
        stringArray(j, "side", Refl.get(net, "side"));
        j.endObject();
        return j.toString();
    }

    private static void stringArray(Json j, String key, Object o) {
        if (o instanceof String[]) j.array(key, (String[]) o);
    }

    private static void intMatrix(Json j, String key, Object o) {
        if (!(o instanceof int[][])) return;
        j.key(key).beginArray();
        for (int[] row : (int[][]) o) {
            j.beginArray();
            if (row != null) for (int v : row) j.value(v);
            j.endArray();
        }
        j.endArray();
    }

    private static void bytes(Json j, Base64.Encoder b64, String key, Object o) {
        if (o instanceof byte[]) j.field(key, b64.encodeToString((byte[]) o));
    }
}
