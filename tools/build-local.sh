#!/usr/bin/env bash
# Builds the Fly UI addon jar with plain javac, without Gradle or internet access.
#
# Needs three jars you already have once Minecraft 1.20.1 + Fabric has been launched:
#   MC_JAR      the intermediary-mapped game jar Fabric Loader writes on first launch:
#               <instance>/.minecraft/.fabric/remappedJars/minecraft-1.20.1-<loader>/client-intermediary.jar
#   LOADER_JAR  fabric-loader-<version>.jar (Prism: <data>/libraries/net/fabricmc/fabric-loader/...)
#   FABRIC_API  fabric-api-<version>+1.20.1.jar from the instance's mods folder
#   BRIGADIER   brigadier-1.1.8.jar (Prism: <data>/libraries/com/mojang/brigadier/1.1.8/)
#
# Usage: MC_JAR=... LOADER_JAR=... FABRIC_API=... BRIGADIER=... tools/build-local.sh
# Output: build/flyui-<version>.jar
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${MC_JAR:?set MC_JAR}"
: "${LOADER_JAR:?set LOADER_JAR}"
: "${FABRIC_API:?set FABRIC_API}"
: "${BRIGADIER:?set BRIGADIER}"

VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/addon/src/main/resources/fabric.mod.json" | head -1)"
OUT="$ROOT/build"
WORK="$OUT/tmp"
rm -rf "$WORK"
mkdir -p "$WORK/api" "$WORK/classes" "$WORK/jar"

# Fabric API is a jar of jars; pull out the modules we compile against.
( cd "$WORK/api" && unzip -oq "$FABRIC_API" 'META-INF/jars/*' )
CP="$MC_JAR:$LOADER_JAR:$BRIGADIER"
for m in fabric-api-base fabric-lifecycle-events-v1 fabric-networking-api-v1; do
  j="$(ls "$WORK/api/META-INF/jars/$m"-*.jar | head -1)"
  CP="$CP:$j"
done

javac --release 17 -encoding UTF-8 -Xlint:-options -nowarn \
  -cp "$CP" -d "$WORK/classes" \
  $(find "$ROOT/addon/src/main/java" -name '*.java')

cp -r "$WORK/classes/." "$WORK/jar/"
cp -r "$ROOT/addon/src/main/resources/." "$WORK/jar/"
mkdir -p "$WORK/jar/web"
cp -r "$ROOT/web/." "$WORK/jar/web/"
cp "$ROOT/LICENSE" "$WORK/jar/LICENSE_flyui"

mkdir -p "$OUT"
JAR="$OUT/flyui-$VERSION.jar"
rm -f "$JAR"
( cd "$WORK/jar" && jar --create --file "$JAR" . )
echo "built $JAR"
