/* ═══════════════════════════════════════════
   特效引擎 - 下雨 / 踢球 / 咖啡杯
   ═══════════════════════════════════════════ */

const EffectsEngine = (() => {
  // ─── 下雨效果 ───
  const rainCanvas = document.getElementById('rain-layer');
  let rainCtx = null;
  let rainAnimFrame = null;
  let rainDrops = [];
  let isRaining = false;

  function initRainCanvas() {
    if (!rainCanvas) return;
    // 将 rain-layer 改为 canvas
    if (rainCanvas.tagName !== 'CANVAS') {
      // 已经是 div 了，需要创建 canvas
      const rc = document.createElement('canvas');
      rc.id = 'rain-canvas-inner';
      rc.width = 320;
      rc.height = 460;
      rc.style.width = '100%';
      rc.style.height = '100%';
      rc.style.position = 'absolute';
      rc.style.top = '0';
      rc.style.left = '0';
      rainCanvas.appendChild(rc);
      rainCtx = rc.getContext('2d');
    }
  }

  function startRain(duration) {
    if (!rainCtx) initRainCanvas();
    if (!rainCtx) return;

    isRaining = true;
    rainCanvas.classList.add('visible');
    rainDrops = [];

    // 生成雨滴
    for (let i = 0; i < 80; i++) {
      rainDrops.push({
        x: Math.random() * 320,
        y: Math.random() * 460,
        speed: 4 + Math.random() * 6,
        length: 8 + Math.random() * 12,
        opacity: 0.2 + Math.random() * 0.4,
      });
    }

    cancelAnimationFrame(rainAnimFrame);
    rainLoop();

    // 定时结束
    setTimeout(() => {
      stopRain();
    }, duration || 3000);
  }

  function rainLoop() {
    if (!isRaining || !rainCtx) return;

    rainCtx.clearRect(0, 0, 320, 460);

    rainDrops.forEach(drop => {
      rainCtx.strokeStyle = `rgba(100, 180, 255, ${drop.opacity})`;
      rainCtx.lineWidth = 1.5;
      rainCtx.beginPath();
      rainCtx.moveTo(drop.x, drop.y);
      rainCtx.lineTo(drop.x - 1, drop.y + drop.length);
      rainCtx.stroke();

      drop.y += drop.speed;
      drop.x -= 0.3;

      // 回到顶部
      if (drop.y > 460) {
        drop.y = -drop.length;
        drop.x = Math.random() * 340;
      }

      // 水花效果（落到底部时）
      if (drop.y > 410 && drop.y < 415) {
        rainCtx.fillStyle = `rgba(100, 180, 255, ${drop.opacity * 0.5})`;
        rainCtx.beginPath();
        rainCtx.arc(drop.x, 412, 2, 0, Math.PI, true);
        rainCtx.fill();
      }
    });

    rainAnimFrame = requestAnimationFrame(rainLoop);
  }

  function stopRain() {
    isRaining = false;
    cancelAnimationFrame(rainAnimFrame);
    if (rainCtx) rainCtx.clearRect(0, 0, 320, 460);
    rainCanvas.classList.remove('visible');
  }

  // ─── 踢球效果 ───
  const ballEl = document.getElementById('kick-ball');
  let ballAnimFrame = null;
  let ballX = 0, ballY = 0;
  let ballVX = 0, ballVY = 0;
  let isBallActive = false;
  let ballBounceCount = 0;
  let ballCallback = null;

  // 追球阶段
  let chasePhase = false;
  let chaseTarget = { x: 0, y: 0 };

  function kickBall(onComplete) {
    if (!ballEl) return;

    const pos = BehaviorEngine.getPosition();
    ballCallback = onComplete || null;

    // 球从企鹅脚下开始
    ballX = pos.x + 80;
    ballY = pos.y + 140;

    // 随机方向踢出
    const angle = -Math.PI / 4 + Math.random() * (-Math.PI / 4);
    const power = 6 + Math.random() * 4;
    ballVX = Math.cos(angle) * power * (Math.random() > 0.5 ? 1 : -1);
    ballVY = Math.sin(angle) * power;

    isBallActive = true;
    ballBounceCount = 0;
    chasePhase = false;
    ballEl.textContent = '⚽';
    ballEl.classList.add('visible');

    // 企鹅踢球动画
    SpriteRenderer.setAnimation('kick_ball');

    cancelAnimationFrame(ballAnimFrame);
    setTimeout(() => {
      ballPhysicsLoop();
    }, 400); // 等踢球动画播放一下
  }

  function ballPhysicsLoop() {
    if (!isBallActive) return;

    // 物理模拟
    ballVY += 0.3; // 重力
    ballVX *= 0.995; // 空气阻力
    ballX += ballVX;
    ballY += ballVY;

    const WIN_W = 320, WIN_H = 460;
    const BALL_R = 12;

    // 左右边界弹跳
    if (ballX < BALL_R) {
      ballX = BALL_R;
      ballVX = Math.abs(ballVX) * 0.7;
      ballBounceCount++;
    } else if (ballX > WIN_W - BALL_R) {
      ballX = WIN_W - BALL_R;
      ballVX = -Math.abs(ballVX) * 0.7;
      ballBounceCount++;
    }

    // 上下边界弹跳
    if (ballY < BALL_R) {
      ballY = BALL_R;
      ballVY = Math.abs(ballVY) * 0.7;
    } else if (ballY > WIN_H - 110) { // 底部
      ballY = WIN_H - 110;
      ballVY = -Math.abs(ballVY) * 0.6;
      ballBounceCount++;
    }

    // 更新球位置
    ballEl.style.left = (ballX - BALL_R) + 'px';
    ballEl.style.top = (ballY - BALL_R) + 'px';

    // 球慢下来后进入追逐阶段
    const speed = Math.sqrt(ballVX * ballVX + ballVY * ballVY);
    if ((speed < 1.5 || ballBounceCount >= 5) && !chasePhase) {
      chasePhase = true;
      chaseTarget = { x: ballX, y: ballY };
      // 企鹅追球
      startChasingBall();
      return;
    }

    // 旋转球
    const rotation = (Date.now() / 10) % 360;
    ballEl.style.transform = `rotate(${rotation}deg)`;

    ballAnimFrame = requestAnimationFrame(ballPhysicsLoop);
  }

  function startChasingBall() {
    // 企鹅跑向球的位置
    const pos = BehaviorEngine.getPosition();
    const targetX = ballX - 80;
    const dir = targetX > pos.x ? 1 : -1;
    SpriteRenderer.setAnimation(dir > 0 ? 'walk_right' : 'walk_left');

    let cx = pos.x;
    let cy = pos.y;
    const chaseSpeed = 2;

    function chaseLoop() {
      if (!isBallActive) return;

      const dx = (ballX - 80) - cx;
      const dy = (ballY - 140) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 20) {
        // 追到了！再踢一脚
        SpriteRenderer.setAnimation('kick_ball');
        ballVX = (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 3);
        ballVY = -(3 + Math.random() * 2);
        chasePhase = false;
        ballBounceCount = 0;

        // 更新位置
        const petContainer = document.getElementById('pet-container');
        petContainer.style.left = cx + 'px';
        petContainer.style.top = cy + 'px';

        // 再弹一会后结束
        setTimeout(() => {
          endBall();
        }, 2000);

        ballPhysicsLoop();
        return;
      }

      cx += (dx / dist) * chaseSpeed;
      cy += (dy / dist) * chaseSpeed * 0.6;

      // 限制范围
      cx = Math.max(0, Math.min(160, cx));
      cy = Math.max(0, Math.min(200, cy));

      const petContainer = document.getElementById('pet-container');
      petContainer.style.left = cx + 'px';
      petContainer.style.top = cy + 'px';

      requestAnimationFrame(chaseLoop);
    }

    chaseLoop();
  }

  function endBall() {
    isBallActive = false;
    cancelAnimationFrame(ballAnimFrame);
    ballEl.classList.remove('visible');
    SpriteRenderer.setAnimation('happy');

    BubbleSystem.show('踢球真开心！还要踢！⚽🎉', 2500);

    setTimeout(() => {
      SpriteRenderer.setAnimation('idle');
      if (ballCallback) ballCallback();
    }, 2000);
  }

  // ─── 咖啡杯效果 ───
  const cupEl = document.getElementById('coffee-cup');
  let cupAnimFrame = null;

  function showCoffeeCup(duration) {
    if (!cupEl) return;

    cupEl.textContent = '☕';
    cupEl.classList.add('visible');

    // 播放喝咖啡动画
    SpriteRenderer.setAnimation('coffee_drink');

    // 持续跟随企鹅位置
    function followPet() {
      const pos = BehaviorEngine.getPosition();
      cupEl.style.left = (pos.x + 115) + 'px';
      cupEl.style.top = (pos.y + 35) + 'px';

      if (cupEl.classList.contains('visible')) {
        cupAnimFrame = requestAnimationFrame(followPet);
      }
    }
    followPet();

    setTimeout(() => {
      hideCoffeeCup();
    }, duration || 3000);
  }

  function hideCoffeeCup() {
    if (!cupEl) return;
    cupEl.classList.remove('visible');
    cancelAnimationFrame(cupAnimFrame);
  }

  // ─── 初始化 ───
  function init() {
    initRainCanvas();
  }

  return {
    init,
    startRain,
    stopRain,
    kickBall,
    showCoffeeCup,
    hideCoffeeCup,
  };
})();
