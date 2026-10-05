# Fly UI: данные аддона

Аддон слушает `http://127.0.0.1:8765` (см. `config/flyui.properties`). Все ответы разрешены для любого источника (CORS `*`), поэтому к аддону можно подключить свою страницу или скрипт.

| Путь | Что возвращает |
|---|---|
| `GET /` | Веб-страница (файлы из `web/`, упакованные в jar). |
| `GET /api/hello` | `{addon, version, mod, modVersion, port, sampleHz}`. Проверка, что это Fly UI. |
| `GET /api/state` | Последний снимок состояния (формат ниже). |
| `GET /api/stream` | Тот же снимок как Server-Sent Events, каждый раз, когда появляется новый. |
| `GET /api/meta` | Схема мозга: какие нейроны входят в какие каналы и выходы. Запрашивается один раз. |
| `GET /api/activity?fly=<uuid>&kind=rate\|v` | Бинарный ответ, по одному байту на нейрон. |
| `GET /api/vision?fly=<uuid>` | Кадр «зрения». Первый запрос включает съёмку и возвращает `202 {"pending":true}`. |
| `GET /api/circuit?name=escape\|steering` | Граф цепи побега или шага из jar мода (узлы с типами клеток и рёбра). |
| `GET /api/net?fly=<uuid>&name=escape\|steering` | Порядок узлов цепи, в котором идут массивы `v` в снимке. |

Если `fly` не указан, берётся первая найденная муха.

## Снимок `/api/state`

```jsonc
{
  "v": 1, "addon": "0.1.0", "seq": 1234, "tick": 5678, "ms": 1791230000000,
  "world": true,            // false, пока мир не открыт
  "mod": true,              // установлен ли Connectome Fly
  "sampleHz": 10, "timeOfDay": 6000,
  "brainsRunning": 1, "maxBrains": 2,
  "flies": [ {
    "uuid": "…", "id": 42, "dim": "minecraft:overworld",
    "x": 0, "y": 64, "z": 0, "yaw": 90, "pitch": 0, "vx": 0, "vy": 0, "vz": 0,
    "alive": true, "onGround": true, "health": 10, "maxHealth": 10, "sleeping": false,
    "hunger": 14.2,           // на самом деле сытость: 0–20, еда прибавляет
    "thirst": 6.9,            // жажда: 0–20, растёт со временем
    "growth": 108000, "baby": false, "male": false, "flying": false, "grooming": false,
    "hud": "body=…;doing=…;…",     // строка HUD мода
    "hudExtra": "cmp=…;mem=…;…",   // вторая строка HUD мода
    "state": "…", "debug": "…",    // отладочные строки мода
    "mind":   { … },          // все простые поля FlyMind (решения, память, сон, вкус…)
    "entity": { …, "lastSensed": { "threatFound": true, "threatLoom": 0.6, … } },
    "brain": {
      "ready": true, "running": true, "pamLP": 0.4, "ppl1LP": 0.05,
      "memory": [ … ], "dopamine": [ … ],
      "loco": {
        "chanSpikes": [ … ],  // по одному числу на канал, порядок как meta.chanNames
        "outRate":   [ … ],   // по одному на выход, порядок как meta.outNames
        "outBase":   [ … ],   // фоновая частота тех же выходов
        "turnBias": 0.1, "walkDrive": 1.2, "activity": 1.1, "stepsPerSec": 1000,
        "dnLeft": 0.2, "dnRight": 0.3, "compassAngle": 1.2, "compassAmp": 0.6,
        "epgRate": 30, "memAvoid": 0.2, "memApproach": 0.3
      }
    },
    "intent":   { "jump": false, "fleeing": false, "dnSpikes": 0, "sensorySpikes": 0, … },
    "escape":   { "v": [ … ], "spiked": [ … ] },   // цепь побега, порядок из /api/net
    "steering": { "v": [ … ], "spiked": [ … ] },
    "props": [ { "kind": "FOOD", "dx": 3, "dy": 0, "dz": 2, "effect": "…", "channel": "…" } ]
  } ]
}
```

Поля `mind` и `entity` собираются автоматически из всех простых полей классов мода, поэтому их набор зависит от версии Connectome Fly.

## Активность `/api/activity`

Один байт на нейрон, длина равна `meta.n`.

- `kind=rate`: след частоты разрядов `a[i]` из модели мода. Он растёт на 0,4 при каждом спайке и затухает с постоянной времени 250 мс, так что частота ≈ `10·a` Гц. Кодировка `min(255, a·32)`, то есть частота ≈ `байт × 0,3125` Гц. У сенсорных нейронов этот след всегда 0: в модели они не адаптируются. Их активность смотрите в `loco.chanSpikes`.
- `kind=v`: мембранный потенциал (сброс 0, порог 1), кодировка `clamp((v + 0,5) / 1,5) × 255`.

## Схема `/api/meta`

`n`, `nEdges`, `chanNames`, `chanIdx` (номера нейронов каждого канала), `outNames`, `outLabels` (описания выходов от авторов мода), `outIdx`, `epgIdx` и `epgAngle` (клетки компаса и их углы), а также base64-массивы по одному байту на нейрон: `sensory`, `dnclass`, `mbonClass`, `neuronChan`, `isKC`.

## Зрение `/api/vision`

`w × h` лучей. Азимут от `az0` до `az1` (0 — вперёд, плюс — вправо), высота от `el1` (верх) до `el0`. В base64: `rgb` (по 3 байта на луч), `depth` (0–254 — доля от `range`, 255 — небо), `kind` (0 небо, 1 блок, 2 существо, 3 угроза, 4 другая муха, 5 игрок). `entities` — существа рядом с `az`, `el`, `dist`, угловым размером `size` и флагом `visible`.
