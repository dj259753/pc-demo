# QQ 宠物动画参考手册

> 自动生成自项目源码分析 · 2026-04-08  
> 项目路径：`/Users/Apple/Desktop/pc-demo-new/`

---

## 一、动画系统概览

| 项 | 值 |
|---|---|
| 动画渲染 | Ruffle (Flash WASM 模拟器) 直接播放 SWF |
| 清单文件 | `renderer/sprites/qc/swf-manifest.json` (425 条) |
| 帧信息文件 | `renderer/sprites/qc/animation-manifest.json` |
| SWF 素材目录 | `renderer/sprites/qc/swf/` |
| 核心渲染模块 | `renderer/js/sprite.js` (SpriteRenderer) |
| 帧率 | 83ms/帧 (约 12fps) |
| 帧尺寸 | 160×160 px |
| 体型 | GG / Adult |

### 心情分类

5 种心情，每种拥有独立的 Stand / Speak / Appear / Hide / interact / play 动画池：

| 心情 | 中文名 | interact 数 | play 数 |
|------|--------|------------|--------|
| happy | 开心 | 24 | 47 |
| peaceful | 平静 | 33 | 100 |
| sad | 悲伤 | 18 | 22 |
| upset | 不爽 | 12 | 23 |
| prostrate | 趴下/沮丧 | 18 | 46 |

---

## 二、通用动画（不分心情）

这些动画位于 `swf/` 根目录，所有心情共用。

### 2.1 入场 / 退出

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Enter1` | `swf/Enter1.swf` | 89 | 应用启动入场（随机池之一） |
| `Enter2` | `swf/Enter2.swf` | 33 | （不使用，太简陋） |
| `Enter3` | `swf/Enter3.swf` | 114 | 应用启动入场（随机池之一） |
| `Exit1` | `swf/Exit1.swf` | 6 | — |
| `Exit2` | `swf/Exit2.swf` | 82 | 退出动画（随机池之一） |
| `Exit3` | `swf/Exit3.swf` | 53 | — |
| `Exit4` | `swf/Exit4.swf` | 64 | 退出动画（随机池之一） |
| `First` | `swf/First.swf` | 57 | 首次登场 |

> **代码位置**：  
> 入场 → `app.js` 首次入场动画块，池 = `[Enter1, Enter3]`  
> 退出 → `taskbar-ui.js` 退出菜单项，池 = `[Exit2, Exit4]`

### 2.2 吃东西

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Eat1` | `swf/Eat1.swf` | 29 | 喂食/吃进程动画 |
| `Eat2` | `swf/Eat2.swf` | 13 | 吃东西变体 |

> **触发**：`PetState` state-change → `eating` → `SpriteRenderer.getQCCommon('eat')` 随机选取

### 2.3 洗澡

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Clean1` | `swf/Clean1.swf` | 18 | 洗澡/清洁动画 |
| `Clean2` | `swf/Clean2.swf` | 67 | 清洁变体 |

> **触发**：`PetState` state-change → `washing` → `SpriteRenderer.getQCCommon('clean')` 随机选取

### 2.4 生病 / 治疗

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Sick1` | `swf/Sick1.swf` | 6 | 生病状态 |
| `Sick2` | `swf/Sick2.swf` | 14 | 生病变体 |
| `Cure1` | `swf/Cure1.swf` | 5 | 治疗动画 |
| `Cure2` | `swf/Cure2.swf` | 9 | 治疗变体 |

### 2.5 死亡 / 复活

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Dying` | `swf/Dying.swf` | 7 | 垂死状态 |
| `Die` | `swf/Die.swf` | 1 | 死亡（单帧） |
| `Revival` | `swf/Revival.swf` | 21 | 复活 |
| `Bury` | `swf/Bury.swf` | 68 | 埋葬 |

### 2.6 升级 / 过渡

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `LevUp` | `swf/LevUp.swf` | 61 | 升级 |
| `Etoj` | `swf/Etoj.swf` | 15 | 站立→趴下过渡（happy→prostrate） |
| `Jtoc` | `swf/Jtoc.swf` | 18 | 趴下→站立过渡（prostrate→happy） |

> **触发**：`PetState` mood-change，当 `happy↔prostrate` 切换时自动播放过渡动画

### 2.7 吸附隐藏

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `Hide_left` | `swf/Hide_left.swf` | 14 | 吸附到屏幕左边缘 |
| `Hide_right` | `swf/Hide_right.swf` | 15 | 吸附到屏幕右边缘 |

> **触发**：`edge-snap.js` → 拖拽到屏幕边缘 → `SpriteRenderer.forceSetAnimation('Hide_left'/'Hide_right')`  
> **恢复**：点击宠物 → 播放对应心情的 Appear 动画

### 2.8 小游戏

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `game-Game1` | `swf/game/Game1.swf` | 20 | 小游戏动画 |

> **触发**：拜访模式 invite-game 动作 → `SpriteRenderer.getQCCommon('game')`

---

## 三、心情动画（按心情分列）

### 3.1 开心 (happy)

#### 基础动画

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `happy-Stand` | `swf/happy/Stand.swf` | 46 | 开心站立循环（默认） |
| `happy-Speak` | `swf/happy/Speak.swf` | 23 | 开心说话（AI 回复/碎碎念） |
| `happy-Appear` | `swf/happy/Appear.swf` | 16 | 开心出现 |
| `happy-Hide` | `swf/happy/Hide.swf` | 16 | 开心隐藏 |

#### 互动动画 (interact) — 24 个

| 动画名 | SWF 文件 | 帧数 | 编码推测 |
|--------|---------|------|---------|
| `happy-interact-010` | `swf/happy/interact/010.swf` | 34 | 特殊互动 |
| `happy-interact-BE1` | `swf/happy/interact/BE1.swf` | 11 | 身体(Body)互动 |
| `happy-interact-BE2` | `swf/happy/interact/BE2.swf` | 6 | 身体互动 |
| `happy-interact-BE3` | `swf/happy/interact/BE3.swf` | 13 | 身体互动 |
| `happy-interact-BE4` | `swf/happy/interact/BE4.swf` | 7 | 身体互动 |
| `happy-interact-BE5` | `swf/happy/interact/BE5.swf` | 11 | 身体互动 |
| `happy-interact-BE6` | `swf/happy/interact/BE6.swf` | 25 | 身体互动 |
| `happy-interact-BE7` | `swf/happy/interact/BE7.swf` | 22 | 身体互动 |
| `happy-interact-H1` | `swf/happy/interact/H1.swf` | 5 | 头部(Head)互动 / 抚摸 |
| `happy-interact-H2` | `swf/happy/interact/H2.swf` | 14 | 头部互动 |
| `happy-interact-H3` | `swf/happy/interact/H3.swf` | 12 | 头部互动 |
| `happy-interact-LE1` | `swf/happy/interact/LE1.swf` | 7 | 左眼互动 |
| `happy-interact-LF1` | `swf/happy/interact/LF1.swf` | 25 | 左脚互动 |
| `happy-interact-LF2` | `swf/happy/interact/LF2.swf` | 8 | 左脚互动 |
| `happy-interact-LF3` | `swf/happy/interact/LF3.swf` | 52 | 左脚互动 |
| `happy-interact-LFA1` | `swf/happy/interact/LFA1.swf` | 40 | 左脚变体 |
| `happy-interact-LH1` | `swf/happy/interact/LH1.swf` | 11 | 左手互动 |
| `happy-interact-LH2` | `swf/happy/interact/LH2.swf` | 9 | 左手互动 |
| `happy-interact-LH3` | `swf/happy/interact/LH3.swf` | 54 | 左手互动 |
| `happy-interact-M1` | `swf/happy/interact/M1.swf` | 18 | 嘴巴(Mouth)互动 |
| `happy-interact-M2` | `swf/happy/interact/M2.swf` | 22 | 嘴巴互动 |
| `happy-interact-M3` | `swf/happy/interact/M3.swf` | 9 | 嘴巴互动 |
| `happy-interact-M4` | `swf/happy/interact/M4.swf` | 47 | 嘴巴互动 |
| `happy-interact-M5` | `swf/happy/interact/M5.swf` | 43 | 嘴巴互动 |
| `happy-interact-RF1` | `swf/happy/interact/RF1.swf` | 7 | 右脚互动 |
| `happy-interact-RF2` | `swf/happy/interact/RF2.swf` | 6 | 右脚互动 |
| `happy-interact-RH1` | `swf/happy/interact/RH1.swf` | 22 | 右手互动 / 挥手/击掌 |
| `happy-interact-RH2` | `swf/happy/interact/RH2.swf` | 5 | 右手互动 |
| `happy-interact-RH3` | `swf/happy/interact/RH3.swf` | 6 | 右手互动 |
| `happy-interact-RH4` | `swf/happy/interact/RH4.swf` | 52 | 右手互动 |
| `happy-interact-RH5` | `swf/happy/interact/RH5.swf` | 8 | 右手互动 |

#### 游玩动画 (play) — 47 个

`happy-play-P1` ~ `happy-play-P47`，对应 SWF 文件 `swf/happy/play/P1.swf` ~ `P47.swf`

| 动画名范围 | 数量 | SWF 目录 |
|-----------|------|---------|
| `happy-play-P1` ~ `happy-play-P47` | 47 | `swf/happy/play/` |

---

### 3.2 平静 (peaceful)

#### 基础动画

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `peaceful-Stand` | `swf/peaceful/Stand.swf` | 38 | 平静站立循环（默认初始心情） |
| `peaceful-Stand1` | `swf/peaceful/Stand1.swf` | 36 | 平静站立变体 |
| `peaceful-Speak` | `swf/peaceful/Speak.swf` | 5 | 平静说话 |
| `peaceful-Appear` | `swf/peaceful/Appear.swf` | 16 | 平静出现 |
| `peaceful-Hide` | `swf/peaceful/Hide.swf` | 12 | 平静隐藏 |

#### 互动动画 (interact) — 33 个

| 动画名 | SWF 文件 | 帧数 | 编码推测 |
|--------|---------|------|---------|
| `peaceful-interact-BE1` | `swf/peaceful/interact/BE1.swf` | 4 | 身体互动 / 拥抱 |
| `peaceful-interact-BE2` | `swf/peaceful/interact/BE2.swf` | 15 | 身体互动 |
| `peaceful-interact-BE3` | `swf/peaceful/interact/BE3.swf` | 21 | 身体互动 |
| `peaceful-interact-BE4` | `swf/peaceful/interact/BE4.swf` | 14 | 身体互动 |
| `peaceful-interact-BE5` | `swf/peaceful/interact/BE5.swf` | 23 | 身体互动 |
| `peaceful-interact-BE6` | `swf/peaceful/interact/BE6.swf` | 14 | 身体互动 |
| `peaceful-interact-H1` | `swf/peaceful/interact/H1.swf` | 19 | 头部互动 / 抚摸 |
| `peaceful-interact-H2` | `swf/peaceful/interact/H2.swf` | 11 | 头部互动 |
| `peaceful-interact-H3` | `swf/peaceful/interact/H3.swf` | 8 | 头部互动 |
| `peaceful-interact-H4` | `swf/peaceful/interact/H4.swf` | 9 | 头部互动 |
| `peaceful-interact-H5` | `swf/peaceful/interact/H5.swf` | 16 | 头部互动 / 抚摸 |
| `peaceful-interact-H6` | `swf/peaceful/interact/H6.swf` | 13 | 头部互动 |
| `peaceful-interact-H7` | `swf/peaceful/interact/H7.swf` | 6 | 头部互动 |
| `peaceful-interact-H8` | `swf/peaceful/interact/H8.swf` | 4 | 头部互动 |
| `peaceful-interact-LE1` | `swf/peaceful/interact/LE1.swf` | 6 | 左眼互动 |
| `peaceful-interact-LE2` | `swf/peaceful/interact/LE2.swf` | 12 | 左眼互动 |
| `peaceful-interact-LE3` | `swf/peaceful/interact/LE3.swf` | 13 | 左眼互动 |
| `peaceful-interact-LF1` | `swf/peaceful/interact/LF1.swf` | 5 | 左脚互动 |
| `peaceful-interact-LF2` | `swf/peaceful/interact/LF2.swf` | 34 | 左脚互动 |
| `peaceful-interact-LF3` | `swf/peaceful/interact/LF3.swf` | 4 | 左脚互动 |
| `peaceful-interact-LF4` | `swf/peaceful/interact/LF4.swf` | 4 | 左脚互动 |
| `peaceful-interact-LF5` | `swf/peaceful/interact/LF5.swf` | 16 | 左脚互动 |
| `peaceful-interact-LH1` | `swf/peaceful/interact/LH1.swf` | 10 | 左手互动 |
| `peaceful-interact-LH2` | `swf/peaceful/interact/LH2.swf` | 4 | 左手互动 |
| `peaceful-interact-LH3` | `swf/peaceful/interact/LH3.swf` | 32 | 左手互动 |
| `peaceful-interact-LH4` | `swf/peaceful/interact/LH4.swf` | 30 | 左手互动 |
| `peaceful-interact-M1` | `swf/peaceful/interact/M1.swf` | 18 | 嘴巴互动 |
| `peaceful-interact-M2` | `swf/peaceful/interact/M2.swf` | 4 | 嘴巴互动 |
| `peaceful-interact-M3` | `swf/peaceful/interact/M3.swf` | 6 | 嘴巴互动 |
| `peaceful-interact-M4` | `swf/peaceful/interact/M4.swf` | 11 | 嘴巴互动 |
| `peaceful-interact-M5` | `swf/peaceful/interact/M5.swf` | 7 | 嘴巴互动 |
| `peaceful-interact-RE1` | `swf/peaceful/interact/RE1.swf` | 7 | 右眼互动 |
| `peaceful-interact-RE2` | `swf/peaceful/interact/RE2.swf` | 11 | 右眼互动 |
| `peaceful-interact-RE3` | `swf/peaceful/interact/RE3.swf` | 5 | 右眼互动 |
| `peaceful-interact-RE4` | `swf/peaceful/interact/RE4.swf` | 5 | 右眼互动 |
| `peaceful-interact-RF1` | `swf/peaceful/interact/RF1.swf` | 4 | 右脚互动 |
| `peaceful-interact-RF2` | `swf/peaceful/interact/RF2.swf` | 4 | 右脚互动 |
| `peaceful-interact-RF3` | `swf/peaceful/interact/RF3.swf` | 8 | 右脚互动 |
| `peaceful-interact-RH1` | `swf/peaceful/interact/RH1.swf` | 4 | 右手互动 / 挥手/击掌 |
| `peaceful-interact-RH2` | `swf/peaceful/interact/RH2.swf` | 10 | 右手互动 |
| `peaceful-interact-RH3` | `swf/peaceful/interact/RH3.swf` | 11 | 右手互动 |
| `peaceful-interact-SC1` | `swf/peaceful/interact/SC1.swf` | 7 | 未知分类 |
| `peaceful-interact-SC2` | `swf/peaceful/interact/SC2.swf` | 7 | 未知分类 |
| `peaceful-interact-SC3` | `swf/peaceful/interact/SC3.swf` | 5 | 未知分类 |

#### 游玩动画 (play) — 100 个

`peaceful-play-P1` ~ `peaceful-play-P100`，对应 SWF 文件 `swf/peaceful/play/P1.swf` ~ `P100.swf`

---

### 3.3 悲伤 (sad)

#### 基础动画

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `sad-Stand` | `swf/sad/Stand.swf` | 45 | 悲伤站立循环 |
| `sad-Stand1` | `swf/sad/Stand1.swf` | 52 | 悲伤站立变体 |
| `sad-Speak` | `swf/sad/Speak.swf` | 11 | 悲伤说话 |
| `sad-Appear` | `swf/sad/Appear.swf` | 15 | 悲伤出现 |
| `sad-Hide` | `swf/sad/Hide.swf` | 13 | 悲伤隐藏 |

#### 互动动画 (interact) — 18 个

| 动画名 | SWF 文件 | 帧数 | 编码推测 |
|--------|---------|------|---------|
| `sad-interact-E1` | `swf/sad/interact/E1.swf` | 9 | 眼泪/情绪 |
| `sad-interact-E2` | `swf/sad/interact/E2.swf` | 18 | 眼泪/情绪 |
| `sad-interact-H1` | `swf/sad/interact/H1.swf` | 8 | 头部互动 |
| `sad-interact-H2` | `swf/sad/interact/H2.swf` | 6 | 头部互动 |
| `sad-interact-H3` | `swf/sad/interact/H3.swf` | 15 | 头部互动 |
| `sad-interact-H4` | `swf/sad/interact/H4.swf` | 4 | 头部互动 |
| `sad-interact-LF1` | `swf/sad/interact/LF1.swf` | 17 | 左脚互动 |
| `sad-interact-LF2` | `swf/sad/interact/LF2.swf` | 4 | 左脚互动 |
| `sad-interact-LH1` | `swf/sad/interact/LH1.swf` | 5 | 左手互动 |
| `sad-interact-M1` | `swf/sad/interact/M1.swf` | 85 | 嘴巴互动（帧数最多） |
| `sad-interact-M2` | `swf/sad/interact/M2.swf` | 9 | 嘴巴互动 |
| `sad-interact-M3` | `swf/sad/interact/M3.swf` | 5 | 嘴巴互动 |
| `sad-interact-M4` | `swf/sad/interact/M4.swf` | 4 | 嘴巴互动 |
| `sad-interact-M5` | `swf/sad/interact/M5.swf` | 4 | 嘴巴互动 |
| `sad-interact-M6` | `swf/sad/interact/M6.swf` | 6 | 嘴巴互动 |
| `sad-interact-M7` | `swf/sad/interact/M7.swf` | 18 | 嘴巴互动 |
| `sad-interact-M8` | `swf/sad/interact/M8.swf` | 6 | 嘴巴互动 |
| `sad-interact-M9` | `swf/sad/interact/M9.swf` | 9 | 嘴巴互动 |
| `sad-interact-RF1` | `swf/sad/interact/RF1.swf` | 9 | 右脚互动 |
| `sad-interact-RF2` | `swf/sad/interact/RF2.swf` | 11 | 右脚互动 |
| `sad-interact-RF3` | `swf/sad/interact/RF3.swf` | 4 | 右脚互动 |
| `sad-interact-RF4` | `swf/sad/interact/RF4.swf` | 5 | 右脚互动 |

#### 游玩动画 (play) — 22 个

`sad-play-P1` ~ `sad-play-P22`，对应 SWF 文件 `swf/sad/play/P1.swf` ~ `P22.swf`

---

### 3.4 不爽 (upset)

#### 基础动画

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `upset-Stand` | `swf/upset/Stand.swf` | 3 | 不爽站立循环 |
| `upset-Stand1` | `swf/upset/Stand1.swf` | 3 | 不爽站立变体 |
| `upset-StandC` | `swf/upset/StandC.swf` | 3 | 不爽站立特殊变体 |
| `upset-Speak` | `swf/upset/Speak.swf` | 6 | 不爽说话 |
| `upset-Appear` | `swf/upset/Appear.swf` | 16 | 不爽出现 |
| `upset-Hide` | `swf/upset/Hide.swf` | 25 | 不爽隐藏 |

#### 互动动画 (interact) — 12 个

| 动画名 | SWF 文件 | 帧数 | 编码推测 |
|--------|---------|------|---------|
| `upset-interact-BE1` | `swf/upset/interact/BE1.swf` | 9 | 身体互动 |
| `upset-interact-BE2` | `swf/upset/interact/BE2.swf` | 12 | 身体互动 |
| `upset-interact-H1` | `swf/upset/interact/H1.swf` | 8 | 头部互动 |
| `upset-interact-H2` | `swf/upset/interact/H2.swf` | 5 | 头部互动 |
| `upset-interact-H3` | `swf/upset/interact/H3.swf` | 6 | 头部互动 |
| `upset-interact-LF1` | `swf/upset/interact/LF1.swf` | 27 | 左脚互动 |
| `upset-interact-LF2` | `swf/upset/interact/LF2.swf` | 6 | 左脚互动 |
| `upset-interact-LF3` | `swf/upset/interact/LF3.swf` | 4 | 左脚互动 |
| `upset-interact-M1` | `swf/upset/interact/M1.swf` | 6 | 嘴巴互动 |
| `upset-interact-M2` | `swf/upset/interact/M2.swf` | 10 | 嘴巴互动 |
| `upset-interact-M3` | `swf/upset/interact/M3.swf` | 5 | 嘴巴互动 |
| `upset-interact-M4` | `swf/upset/interact/M4.swf` | 5 | 嘴巴互动 |
| `upset-interact-M5` | `swf/upset/interact/M5.swf` | 5 | 嘴巴互动 |
| `upset-interact-M6` | `swf/upset/interact/M6.swf` | 7 | 嘴巴互动 |
| `upset-interact-RH1` | `swf/upset/interact/RH1.swf` | 14 | 右手互动 |

> ⚠️ upset 的 interact 动画在 Ruffle 下兼容性最好，被选为拖拽挣扎动画池

#### 游玩动画 (play) — 23 个

`upset-play-P1` ~ `upset-play-P23`，对应 SWF 文件 `swf/upset/play/P1.swf` ~ `P23.swf`

---

### 3.5 趴下/沮丧 (prostrate)

#### 基础动画

| 动画名 | SWF 文件 | 帧数 | 使用场景 |
|--------|---------|------|---------|
| `prostrate-Stand` | `swf/prostrate/Stand.swf` | 50 | 趴下站立循环 |
| `prostrate-Stand1` | `swf/prostrate/Stand1.swf` | 33 | 趴下站立变体 |
| `prostrate-Speak` | `swf/prostrate/Speak.swf` | 14 | 趴下说话 |
| `prostrate-Appear` | `swf/prostrate/Appear.swf` | 16 | 趴下出现 |
| `prostrate-Hide` | `swf/prostrate/Hide.swf` | 16 | 趴下隐藏 |

#### 互动动画 (interact) — 18 个

| 动画名 | SWF 文件 | 帧数 | 编码推测 |
|--------|---------|------|---------|
| `prostrate-interact-BE1` | `swf/prostrate/interact/BE1.swf` | 7 | 身体互动 |
| `prostrate-interact-BE2` | `swf/prostrate/interact/BE2.swf` | 8 | 身体互动 |
| `prostrate-interact-BE3` | `swf/prostrate/interact/BE3.swf` | 14 | 身体互动 |
| `prostrate-interact-BE4` | `swf/prostrate/interact/BE4.swf` | 28 | 身体互动 |
| `prostrate-interact-BE5` | `swf/prostrate/interact/BE5.swf` | 33 | 身体互动 |
| `prostrate-interact-BE6` | `swf/prostrate/interact/BE6.swf` | 11 | 身体互动 |
| `prostrate-interact-F1` | `swf/prostrate/interact/F1.swf` | 14 | 未知(F类) |
| `prostrate-interact-F2` | `swf/prostrate/interact/F2.swf` | 38 | 未知(F类) |
| `prostrate-interact-F3` | `swf/prostrate/interact/F3.swf` | 13 | 未知(F类) |
| `prostrate-interact-FA1` | `swf/prostrate/interact/FA1.swf` | 12 | 未知(FA类) |
| `prostrate-interact-H1` | `swf/prostrate/interact/H1.swf` | 33 | 头部互动 |
| `prostrate-interact-H2` | `swf/prostrate/interact/H2.swf` | 7 | 头部互动 |
| `prostrate-interact-H3` | `swf/prostrate/interact/H3.swf` | 8 | 头部互动 |
| `prostrate-interact-M1` | `swf/prostrate/interact/M1.swf` | 33 | 嘴巴互动 |
| `prostrate-interact-M2` | `swf/prostrate/interact/M2.swf` | 4 | 嘴巴互动 |
| `prostrate-interact-M3` | `swstrate/interact/M3.swf` | 5 | 嘴巴互动 |
| `prostrate-interact-M4` | `swf/prostrate/interact/M4.swf` | 113 | 嘴巴互动（帧数最多） |
| `prostrate-interact-M5` | `swf/prostrate/interact/M5.swf` | 17 | 嘴巴互动 |
| `prostrate-interact-RH1` | `swf/prostrate/interact/RH1.swf` | 14 | 右手互动 |
| `prostrate-interact-RH2` | `swf/prostrate/interact/RH2.swf` | 13 | 右手互动 |
| `prostrate-interact-RH3` | `swf/prostrate/interact/RH3.swf` | 11 | 右手互动 |
| `prostrate-interact-RH4` | `swf/prostrate/interact/RH4.swf` | 5 | 右手互动 |

#### 游玩动画 (play) — 46 个

`prostrate-play-P1` ~ `prostrate-play-P46`，对应 SWF 文件 `swf/prostrate/play/P1.swf` ~ `P46.swf`

---

## 四、场景→动画映射表

以下列出代码中各功能场景实际使用的动画（含调用方式）。

### 4.1 应用生命周期

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **应用启动入场** | `Enter1` / `Enter3` 随机 → 播完切 Stand | `app.js` 首次入场块 |
| **退出应用** | `Exit2` / `Exit4` 随机 → 播完退出 | `taskbar-ui.js` 退出菜单 |
| **首次登场** | `First` | QC_COMMON.first |
| **默认站立** | 当前心情的 Stand（如 `peaceful-Stand`） | `SpriteRenderer.getQCStand(mood)` |

### 4.2 AI 交互

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **AI 思考中** | 当前心情 Stand（不中断） | `app.js` → `setAnimation('thinking')` → LEGACY_MAP → `getQCStand('peaceful')` |
| **AI 说话/回复** | 当前心情 Speak（如 `peaceful-Speak`） | `app.js` → `setAnimation('talking')` → `getQCSpeak(mood)` |
| **语音聆听** | happy Stand | `app.js` → `setAnimation('happy')` → `getQCStand('happy')` |
| **离线睡眠** | prostrate Stand | `app.js` → `setAnimation('sleeping')` → `getQCStand('prostrate')` |
| **AI 碎碎念** | 当前心情 Speak + playOnce | `behavior.js` → 30% Speak + 70% Play |

### 4.3 用户互动

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **拍一拍/点击** | 当前心情 interact 随机 | `app.js` → `getQCInteract(mood)` |
| **抚摸（连续滑动）** | 当前心情 H1 或 H5 | `app.js` → `getQCStroke(mood)` |
| **拖拽释放落地** | 当前心情 interact 随机 + playOnce | `drag.js` → `getQCInteract(mood)` |
| **拖拽挣扎** | upset interact (BE/LF/RF/RH类) | `drag.js` → `getQCStruggle()` |

### 4.4 功能动作

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **吃东西** | `Eat1` / `Eat2` 随机 | `app.js` state-change `eating` → `getQCCommon('eat')` |
| **洗澡** | `Clean1` / `Clean2` 随机 | `app.js` state-change `washing` → `getQCCommon('clean')` |
| **吃进程** | `Eat1`/`Eat2` → happy → idle | `process-manager.js` |
| **文件拖入** | happy → thinking → talking | `file-drop.js` |

### 4.5 空闲行为

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **30% Speak + 碎碎念** | 当前心情 Speak + playOnce | `behavior.js` `playQCIdleAnimation()` |
| **70% Play** | 当前心情 Play 随机 + playOnce | `behavior.js` `playQCIdleAnimation()` |
| **走动** | `walk_right`/`walk_left` → LEGACY_MAP → `getQCPlay('peaceful')` | `behavior.js` |
| **跳跃** | `happy_jump` → LEGACY_MAP → `getQCInteract('happy')` | `behavior.js` |
| **打哈欠** | `yawning` → LEGACY_MAP → `getQCPlay('peaceful')` | `behavior.js` |
| **工作** | `working_1`/`working_2` → LEGACY_MAP → `getQCStand('peaceful')` | `behavior.js` |
| **睡觉** | `sleeping_lie` → LEGACY_MAP → `getQCStand('prostrate')` | `behavior.js` |

### 4.6 心情切换

| 切换方向 | 动画选取逻辑 | 代码位置 |
|---------|------------|---------|
| happy → prostrate | `Etoj` 过渡 → prostrate Stand | `app.js` mood-change |
| prostrate → happy | `Jtoc` 过渡 → happy Stand | `app.js` mood-change |
| 其他切换 | 直接切目标心情 Stand | `app.js` mood-change |

### 4.7 边缘吸附

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **吸附到左侧** | `Hide_left` (forceSetAnimation) | `edge-snap.js` |
| **吸附到右侧** | `Hide_right` (forceSetAnimation) | `edge-snap.js` |
| **解除吸附** | 当前心情 Appear → 3s 后切 Stand | `edge-snap.js` |

### 4.8 拜访模式

| 场景 | 动画选取逻辑 | 代码位置 |
|------|------------|---------|
| **挥手 wave** | 优先 `{mood}-interact-H` → `peaceful-interact-H` → `happy-interact-H` | `sprite.js` `getQCVisitAction('wave')` |
| **握手 handshake** | 优先 `{mood}-interact-RH` → `peaceful/happy-interact-RH` | `sprite.js` `getQCVisitAction('handshake')` |
| **拥抱 hug** | 优先 `{mood}-interact-BE` → `peaceful/happy-interact-BE` | `sprite.js` `getQCVisitAction('hug')` |
| **击掌 highfive** | 优先 `{mood}-interact-RH` → `happy/peaceful-interact-RH` | `sprite.js` `getQCVisitAction('highfive')` |
| **邀请游戏 invite-game** | `game-Game1` → 当前心情 play 池 | `sprite.js` `getQCVisitAction('invite-game')` |
| **访客站立** | `getQCStand(mood)` 或 `getQCStand('peaceful')` | `sprite.js` `setGuestStand()` |

---

## 五、旧动画名 → QC 动画映射

代码中使用 Legacy 动画名，由 `sprite.js` 的 `LEGACY_MAP` 自动映射到 QC SWF 动画：

| 旧名 | 映射到 | 实际 SWF |
|------|-------|---------|
| `idle` | `getQCStand('peaceful')` | `peaceful-Stand` |
| `happy` | `getQCStand('happy')` | `happy-Stand` |
| `happy_jump` | `getQCInteract('happy')` | happy interact 随机 |
| `sad` | `getQCStand('sad')` | `sad-Stand` |
| `eating` | `getQCCommon('eat')` | `Eat1`/`Eat2` 随机 |
| `washing` | `getQCCommon('clean')` | `Clean1`/`Clean2` 随机 |
| `thinking` | `getQCStand('peaceful')` | `peaceful-Stand` |
| `talking` | `getQCSpeak('peaceful')` | `peaceful-Speak` |
| `sleeping` | `getQCStand('prostrate')` | `prostrate-Stand` |
| `sleeping_lie` | `getQCStand('prostrate')` | `prostrate-Stand` |
| `working` | `getQCStand('peaceful')` | `peaceful-Stand` |
| `working_1` | `getQCStand('peaceful')` | `peaceful-Stand` |
| `working_2` | `getQCStand('peaceful')` | `peaceful-Stand` |
| `error` | `getQCStand('upset')` | `upset-Stand` |
| `walk_right` | `getQCPlay('peaceful')` | peaceful play 随机 |
| `walk_left` | `getQCPlay('peaceful')` | peaceful play 随机 |
| `yawning` | `getQCPlay('peaceful')` | peaceful play 随机 |

---

## 六、interact 编码参考

interact 动画文件名中的前缀编码含义（推测）：

| 编码 | 推测含义 | 使用场景 |
|------|---------|---------|
| BE | Body / 拥抱 | 拥抱(hug) 互动 |
| H | Head / 头部 | 抚摸(stroke)、挥手(wave) |
| LH | Left Hand | 挥手(wave) |
| RH | Right Hand | 握手(handshake)、击掌(highfive)、挥手 |
| LF | Left Foot | 走路/踢腿 |
| RF | Right Foot | 走路/踢腿 |
| LE | Left Eye | 左眼互动 |
| RE | Right Eye | 右眼互动 |
| M | Mouth | 嘴巴互动 |
| E | Emotion/眼泪 | 悲伤特有 |
| F / FA | 未知 | 趴下特有 |
| SC | 未知 | 平静特有 |

---

## 七、动画路由规则

`sprite.js` 实现了原版 QQ 宠物的 SWF 路由状态机，控制动画优先级和播完后回退：

| 路由状态 | 优先级(power) | 播完回退 | 说明 |
|---------|-------------|---------|------|
| normal (Stand) | 0 | — | 基础站立，最低优先级 |
| speak | 100 | → normal | 说话播完回站立 |
| play | 50 | → normal | 游玩播完回站立 |
| interact | 50 | → normal | 互动播完回站立 |
| appear | 150 | → normal | 出现播完回站立 |
| eat / clean / cure / sick | 150 | → normal | 功能动作播完回站立 |
| game | 150 | — | 小游戏 |
| etoj / jtoc | 66 | → canNext | 站↔趴过渡，播完允许接下一个 |
| hideleft / hideright | 170 | — (冻结末帧) | 吸附状态，冻结在最后一帧 |
| exit | 0 | — | 退出，不可打断 |
| enter | 0 | — | 入场 |

> **关键约束**：吸附状态 (`hideleft`/`hideright`) 下，所有 `setAnimation()` 调用被拒绝，只有 `forceSetAnimation()` 可以打断。

---

## 八、文件索引

| 文件 | 用途 |
|------|------|
| `renderer/sprites/qc/swf-manifest.json` | 动画名 → SWF 路径映射 |
| `renderer/sprites/qc/animation-manifest.json` | 每个动画的帧数/速度/尺寸元信息 |
| `renderer/js/sprite.js` | SpriteRenderer 核心：SWF 加载/路由/动画池/播完检测 |
| `renderer/js/app.js` | 状态→动画映射、入场/互动/抚摸/心情切换 |
| `renderer/js/behavior.js` | 空闲行为调度：Speak/Play 轮转、走动/跳跃/工作 |
| `renderer/js/edge-snap.js` | 边缘吸附：Hide_left/Hide_right/Appea r |
| `renderer/js/drag.js` | 拖拽：落地 interact、挣扎 |
| `renderer/js/taskbar-ui.js` | 退出动画 Exit2/Exit4 |
| `renderer/js/file-drop.js` | 文件拖入动画：happy→thinking→talking |
| `renderer/js/process-manager.js` | 吃进程动画：eating→happy→idle |
| `renderer/js/proactive-chat.js` | 主动聊天/离线睡眠 |
| `renderer/js/visit/visit-session.js` | 拜访模式动画：wave/handshake/hug/highfive/game |
