package io.github.dnocoder.flyui;

/**
 * Tiny streaming JSON writer. No dependencies, no reflection, safe for
 * NaN/Infinity (written as null). Commas are inserted automatically.
 */
final class Json {
    private final StringBuilder sb;
    private final boolean[] first = new boolean[96];
    private int depth = 0;
    private boolean afterKey = false;

    Json() { this(4096); }

    Json(int capacity) { sb = new StringBuilder(capacity); }

    Json beginObject() { sep(); sb.append('{'); push(); return this; }

    Json endObject() { depth--; sb.append('}'); return this; }

    Json beginArray() { sep(); sb.append('['); push(); return this; }

    Json endArray() { depth--; sb.append(']'); return this; }

    Json key(String k) {
        sep();
        str(k);
        sb.append(':');
        afterKey = true;
        return this;
    }

    Json value(String s) {
        sep();
        if (s == null) sb.append("null"); else str(s);
        return this;
    }

    Json value(double d) { sep(); num(d); return this; }

    Json value(long l) { sep(); sb.append(l); return this; }

    Json value(boolean b) { sep(); sb.append(b); return this; }

    Json nul() { sep(); sb.append("null"); return this; }

    /** Inserts an already-serialised JSON fragment as one value. */
    Json raw(String json) { sep(); sb.append(json == null ? "null" : json); return this; }

    Json field(String k, String v) { return key(k).value(v); }

    Json field(String k, double v) { return key(k).value(v); }

    Json field(String k, long v) { return key(k).value(v); }

    Json field(String k, boolean v) { return key(k).value(v); }

    Json array(String k, float[] a) {
        key(k);
        if (a == null) return nul();
        beginArray();
        for (float f : a) value(f);
        return endArray();
    }

    Json array(String k, double[] a) {
        key(k);
        if (a == null) return nul();
        beginArray();
        for (double d : a) value(d);
        return endArray();
    }

    Json array(String k, int[] a) {
        key(k);
        if (a == null) return nul();
        beginArray();
        for (int i : a) value(i);
        return endArray();
    }

    Json array(String k, String[] a) {
        key(k);
        if (a == null) return nul();
        beginArray();
        for (String s : a) value(s);
        return endArray();
    }

    private void push() {
        depth++;
        if (depth >= first.length) throw new IllegalStateException("JSON too deep");
        first[depth] = true;
    }

    private void sep() {
        if (afterKey) { afterKey = false; return; }
        if (depth > 0) {
            if (!first[depth]) sb.append(',');
            first[depth] = false;
        }
    }

    private void num(double d) {
        if (Double.isNaN(d) || Double.isInfinite(d)) { sb.append("null"); return; }
        if (d == Math.rint(d) && Math.abs(d) < 1e15) { sb.append((long) d); return; }
        double a = Math.abs(d);
        double scale = a >= 100 ? 100 : a >= 1 ? 1e4 : 1e6;
        double r = Math.round(d * scale) / scale;
        if (r == Math.rint(r) && Math.abs(r) < 1e15) sb.append((long) r); else sb.append(r);
    }

    private void str(String s) {
        sb.append('"');
        for (int i = 0, n = s.length(); i < n; i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < 0x20 || c == 0x2028 || c == 0x2029) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        sb.append('"');
    }

    @Override
    public String toString() { return sb.toString(); }
}
