package io.github.dnocoder.flyui;

import java.util.Base64;
import java.util.List;

import net.minecraft.class_1297;
import net.minecraft.class_1657;
import net.minecraft.class_238;
import net.minecraft.class_239;
import net.minecraft.class_243;
import net.minecraft.class_2338;
import net.minecraft.class_2680;
import net.minecraft.class_3218;
import net.minecraft.class_3959;
import net.minecraft.class_3965;

/*
 * Intermediary names used here (yarn name in brackets):
 *   class_3959 [RaycastContext]  ShapeType class_3960.field_17559 = OUTLINE,
 *                                FluidHandling class_242.field_1347 = ANY
 *   class_1937#method_17742 [World.raycast], class_1937#method_8333 [getOtherEntities],
 *   class_1937#method_8320 [getBlockState], class_1937#method_8532 [getTimeOfDay]
 *   class_239 [HitResult]        method_17783 getType, method_17784 getPos, class_240.field_1333 = MISS
 *   class_3965 [BlockHitResult]  method_17777 getBlockPos, method_17780 getSide
 *   class_2680 [BlockState]      method_26205 getMapColor -> class_3620 [MapColor] field_16011 = rgb
 *   class_238 [Box]              method_992 raycast, field_1323/1322/1321 min x/y/z, field_1320/1325/1324 max x/y/z
 *   class_243 [Vec3d]            method_1031 add, method_1022 distanceTo
 *   class_1297 [Entity]          method_33571 getEyePos, method_5829 getBoundingBox, method_5864 getType
 *   class_1299 [EntityType]      method_5882 getTranslationKey
 */

/**
 * A crude stand-in for what the fly's eyes face: a fan of rays cast from her eye
 * position into the real Minecraft world, about 330 degrees wide like a fruit fly's
 * compound eyes. This is the addon's own reconstruction, NOT the input the
 * Connectome Fly brain receives (that is a handful of summarised visual channels,
 * which the web page shows next to this picture).
 */
final class Vision {
    static final double AZ0 = -165, AZ1 = 165, EL0 = -60, EL1 = 75;

    static final byte SKY = 0, BLOCK = 1, ENTITY = 2, THREAT = 3, FLY = 4, PLAYER = 5;

    private Vision() {}

    static String compute(class_3218 world, class_1297 fly, Config cfg, long tick) {
        final int w = cfg.visionWidth, h = cfg.visionHeight;
        final double range = cfg.visionRange;
        class_243 eye = fly.method_33571();
        float yaw = fly.method_36454();

        class_238 area = new class_238(eye.field_1352 - range, eye.field_1351 - range, eye.field_1350 - range,
                eye.field_1352 + range, eye.field_1351 + range, eye.field_1350 + range);
        List<class_1297> ents = world.method_8333(fly, area, e -> e.method_5805());
        int ne = ents.size();
        class_238[] boxes = new class_238[ne];
        byte[] kinds = new byte[ne];
        int[] colors = new int[ne];
        int[] hits = new int[ne];
        for (int i = 0; i < ne; i++) {
            class_1297 e = ents.get(i);
            boxes[i] = e.method_5829();
            byte k = FlyBridge.isFly(e) ? FLY : e instanceof class_1657 ? PLAYER
                    : FlyBridge.isThreat(e) ? THREAT : ENTITY;
            kinds[i] = k;
            colors[i] = k == FLY ? 0x5EE6FF : k == PLAYER ? 0xFFD166 : k == THREAT ? 0xFF4040 : 0xC792EA;
        }

        long tod = world.method_8532() % 24000L;
        double day = Math.max(0, Math.min(1, Math.cos((tod - 6000) / 24000.0 * 2 * Math.PI) * 1.5 + 0.5));

        byte[] rgb = new byte[w * h * 3];
        byte[] depth = new byte[w * h];
        byte[] kind = new byte[w * h];
        for (int y = 0; y < h; y++) {
            double el = EL1 - (EL1 - EL0) * (y + 0.5) / h;
            double pitch = Math.toRadians(-el);
            double cp = Math.cos(pitch), sp = Math.sin(pitch);
            for (int x = 0; x < w; x++) {
                double az = AZ0 + (AZ1 - AZ0) * (x + 0.5) / w;
                double yr = Math.toRadians(yaw + az);
                double dx = -Math.sin(yr) * cp, dy = -sp, dz = Math.cos(yr) * cp;
                class_243 end = eye.method_1031(dx * range, dy * range, dz * range);

                double best = Double.MAX_VALUE;
                int color = 0;
                byte k = SKY;
                class_3965 hit = world.method_17742(new class_3959(eye, end,
                        class_3959.class_3960.field_17559, class_3959.class_242.field_1347, fly));
                if (hit != null && hit.method_17783() != class_239.class_240.field_1333) {
                    best = hit.method_17784().method_1022(eye);
                    class_2338 pos = hit.method_17777();
                    class_2680 state = world.method_8320(pos);
                    int c = state.method_26205(world, pos).field_16011;
                    if (c == 0) c = 0x8A8A8A;
                    color = shade(c, faceShade(hit.method_17780().ordinal()));
                    k = BLOCK;
                }
                int hitEnt = -1;
                for (int i = 0; i < ne; i++) {
                    var p = boxes[i].method_992(eye, end);
                    if (p.isPresent()) {
                        double d = p.get().method_1022(eye);
                        if (d < best) {
                            best = d;
                            hitEnt = i;
                        }
                    }
                }
                if (hitEnt >= 0) {
                    color = colors[hitEnt];
                    k = kinds[hitEnt];
                    hits[hitEnt]++;
                }
                int idx = y * w + x;
                if (k == SKY) {
                    color = sky(el, day);
                    depth[idx] = (byte) 255;
                } else {
                    double t = Math.min(1, best / range);
                    color = mix(color, sky(0, day), Math.pow(t, 1.6) * 0.65);
                    color = mix(color, 0x000000, (1 - day) * 0.55);
                    depth[idx] = (byte) Math.round(t * 254);
                }
                kind[idx] = k;
                rgb[idx * 3] = (byte) (color >> 16);
                rgb[idx * 3 + 1] = (byte) (color >> 8);
                rgb[idx * 3 + 2] = (byte) color;
            }
        }

        Json j = new Json(w * h * 6 + 1024);
        Base64.Encoder b64 = Base64.getEncoder();
        j.beginObject()
                .field("uuid", fly.method_5667().toString())
                .field("tick", tick)
                .field("w", w).field("h", h)
                .field("az0", AZ0).field("az1", AZ1).field("el0", EL0).field("el1", EL1)
                .field("range", range)
                .field("day", day)
                .field("rgb", b64.encodeToString(rgb))
                .field("depth", b64.encodeToString(depth))
                .field("kind", b64.encodeToString(kind));
        j.key("entities").beginArray();
        for (int i = 0; i < ne; i++) {
            class_1297 e = ents.get(i);
            class_243 c = boxes[i].method_1005();
            double ddx = c.field_1352 - eye.field_1352, ddy = c.field_1351 - eye.field_1351, ddz = c.field_1350 - eye.field_1350;
            double hd = Math.sqrt(ddx * ddx + ddz * ddz);
            double dist = Math.sqrt(hd * hd + ddy * ddy);
            double yawTo = Math.toDegrees(Math.atan2(-ddx, ddz));
            double az = wrap(yawTo - yaw);
            double el = Math.toDegrees(Math.atan2(ddy, hd));
            double size = Math.toDegrees(2 * Math.atan2(boxes[i].method_995() / 2, Math.max(0.1, dist)));
            j.beginObject()
                    .field("name", entityName(e))
                    .field("kind", kinds[i])
                    .field("az", az).field("el", el).field("dist", dist).field("size", size)
                    .field("visible", hits[i] > 0);
            if (kinds[i] == THREAT) {
                String tn = FlyBridge.threatName(e);
                if (tn != null) j.field("threat", tn);
            }
            j.endObject();
        }
        j.endArray().endObject();
        return j.toString();
    }

    static String entityName(class_1297 e) {
        try {
            if (e instanceof class_1657) {
                // Text.getString() keeps its name in intermediary; called reflectively so the build
                // does not need brigadier (Text extends com.mojang.brigadier.Message) on the classpath.
                Object name = Refl.call(e.method_5477(), "getString");
                if (name != null) return name.toString();
            }
            String key = e.method_5864().method_5882();
            int dot = key.lastIndexOf('.');
            return dot >= 0 ? key.substring(dot + 1) : key;
        } catch (Throwable t) {
            return "?";
        }
    }

    private static double wrap(double deg) {
        deg %= 360;
        if (deg > 180) deg -= 360;
        if (deg < -180) deg += 360;
        return deg;
    }

    /** Light per face, ordinal order of Direction: DOWN, UP, NORTH, SOUTH, WEST, EAST. */
    private static double faceShade(int ordinal) {
        switch (ordinal) {
            case 0: return 0.50;
            case 1: return 1.00;
            case 2: case 3: return 0.80;
            default: return 0.64;
        }
    }

    private static int sky(double el, double day) {
        double t = Math.max(0, Math.min(1, (el + 10) / 85));
        int dayCol = mix(0xC4DCFF, 0x6E9CF5, t);
        int nightCol = mix(0x1C2445, 0x070B1C, t);
        return mix(nightCol, dayCol, day);
    }

    private static int shade(int c, double f) {
        int r = (int) Math.min(255, ((c >> 16) & 255) * f);
        int g = (int) Math.min(255, ((c >> 8) & 255) * f);
        int b = (int) Math.min(255, (c & 255) * f);
        return (r << 16) | (g << 8) | b;
    }

    private static int mix(int a, int b, double t) {
        int r = (int) Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
        int g = (int) Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
        int bl = (int) Math.round((a & 255) * (1 - t) + (b & 255) * t);
        return (r << 16) | (g << 8) | bl;
    }
}
