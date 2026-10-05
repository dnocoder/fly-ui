package io.github.dnocoder.flyui;

import java.lang.reflect.Array;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Cached, failure-tolerant reflection. Everything that touches the Connectome Fly
 * mod goes through here: if the mod changes a field name, that one value becomes
 * null instead of crashing the game.
 */
final class Refl {
    private static final Map<String, Optional<Field>> FIELDS = new ConcurrentHashMap<>();
    private static final Map<String, Optional<Method>> METHODS = new ConcurrentHashMap<>();
    private static final Map<Class<?>, List<Field>> DECLARED = new ConcurrentHashMap<>();

    /** Arrays longer than this are not dumped by {@link #dump}. */
    static final int MAX_DUMP_ARRAY = 128;

    private Refl() {}

    static Field field(Class<?> c, String name) {
        String key = c.getName() + "#" + name;
        return FIELDS.computeIfAbsent(key, k -> {
            for (Class<?> k2 = c; k2 != null && k2 != Object.class; k2 = k2.getSuperclass()) {
                try {
                    Field f = k2.getDeclaredField(name);
                    f.setAccessible(true);
                    return Optional.of(f);
                } catch (NoSuchFieldException ignored) {
                    // keep walking up
                } catch (RuntimeException e) {
                    return Optional.empty();
                }
            }
            return Optional.empty();
        }).orElse(null);
    }

    static Object get(Object o, String name) {
        if (o == null) return null;
        Field f = field(o.getClass(), name);
        if (f == null) return null;
        try {
            return f.get(o);
        } catch (Throwable t) {
            return null;
        }
    }

    static Object getStatic(Class<?> c, String name) {
        if (c == null) return null;
        Field f = field(c, name);
        if (f == null) return null;
        try {
            return f.get(null);
        } catch (Throwable t) {
            return null;
        }
    }

    static Method method(Class<?> c, String name, Class<?>... params) {
        StringBuilder key = new StringBuilder(c.getName()).append('#').append(name);
        for (Class<?> p : params) key.append(',').append(p.getName());
        return METHODS.computeIfAbsent(key.toString(), k -> {
            for (Class<?> k2 = c; k2 != null && k2 != Object.class; k2 = k2.getSuperclass()) {
                try {
                    Method m = k2.getDeclaredMethod(name, params);
                    m.setAccessible(true);
                    return Optional.of(m);
                } catch (NoSuchMethodException ignored) {
                    // keep walking up
                } catch (RuntimeException e) {
                    return Optional.empty();
                }
            }
            return Optional.empty();
        }).orElse(null);
    }

    /** Calls a no-argument method; returns null on any problem. */
    static Object call(Object o, String name) {
        if (o == null) return null;
        Method m = method(o.getClass(), name);
        if (m == null) return null;
        try {
            return m.invoke(o);
        } catch (Throwable t) {
            return null;
        }
    }

    static Object callStatic(Class<?> c, String name, Class<?>[] types, Object... args) {
        if (c == null) return null;
        Method m = method(c, name, types);
        if (m == null) return null;
        try {
            return m.invoke(null, args);
        } catch (Throwable t) {
            return null;
        }
    }

    static double num(Object o, double fallback) {
        return o instanceof Number ? ((Number) o).doubleValue() : fallback;
    }

    static boolean bool(Object o) {
        return o instanceof Boolean && (Boolean) o;
    }

    private static List<Field> declared(Class<?> c) {
        return DECLARED.computeIfAbsent(c, k -> {
            List<Field> out = new ArrayList<>();
            for (Field f : k.getDeclaredFields()) {
                if (Modifier.isStatic(f.getModifiers()) || f.isSynthetic()) continue;
                try {
                    f.setAccessible(true);
                    out.add(f);
                } catch (RuntimeException ignored) {
                    // inaccessible; skip
                }
            }
            return out;
        });
    }

    /**
     * Writes every simple field the object declares (primitives, strings, enums,
     * short primitive arrays, small string-keyed maps) as one JSON object.
     * Nested objects of a class listed in {@code nested} are dumped one level deep.
     */
    static void dump(Json j, Object o, Set<String> nested, Set<String> skip) {
        if (o == null) { j.nul(); return; }
        j.beginObject();
        for (Field f : declared(o.getClass())) {
            String name = f.getName();
            if (skip != null && skip.contains(name)) continue;
            Object v;
            try {
                v = f.get(o);
            } catch (Throwable t) {
                continue;
            }
            writeValue(j, name, v, nested);
        }
        j.endObject();
    }

    private static void writeValue(Json j, String name, Object v, Set<String> nested) {
        if (v == null) return;
        if (v instanceof Number) {
            j.field(name, ((Number) v).doubleValue());
        } else if (v instanceof Boolean) {
            j.field(name, (Boolean) v);
        } else if (v instanceof Character) {
            j.field(name, String.valueOf(v));
        } else if (v instanceof CharSequence) {
            j.field(name, v.toString());
        } else if (v instanceof Enum) {
            j.field(name, ((Enum<?>) v).name());
        } else if (v.getClass().isArray()) {
            Class<?> ct = v.getClass().getComponentType();
            if (!ct.isPrimitive() && ct != String.class) return;
            int n = Array.getLength(v);
            if (n > MAX_DUMP_ARRAY) return;
            j.key(name).beginArray();
            for (int i = 0; i < n; i++) {
                Object e = Array.get(v, i);
                if (e instanceof Number) j.value(((Number) e).doubleValue());
                else if (e instanceof Boolean) j.value((Boolean) e);
                else j.value(String.valueOf(e));
            }
            j.endArray();
        } else if (v instanceof Map) {
            Map<?, ?> m = (Map<?, ?>) v;
            if (m.size() > MAX_DUMP_ARRAY) return;
            j.key(name).beginObject();
            try {
                for (Map.Entry<?, ?> e : m.entrySet()) {
                    Object val = e.getValue();
                    String k = String.valueOf(e.getKey());
                    if (val instanceof Number) j.field(k, ((Number) val).doubleValue());
                    else if (val instanceof Boolean) j.field(k, (Boolean) val);
                    else if (val instanceof CharSequence || val instanceof Enum) j.field(k, String.valueOf(val));
                }
            } catch (RuntimeException ignored) {
                // concurrent modification: keep what we have
            }
            j.endObject();
        } else if (nested != null && nested.contains(v.getClass().getName())) {
            j.key(name);
            dump(j, v, null, null);
        }
    }
}
