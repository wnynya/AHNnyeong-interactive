import Vector from './vector';

class Entity {
  // 엔티티의 초기 위치는 정규화된 [-1,1] 범위
  constructor(x, y) {
    this.pos = new Vector(x, y);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.001 + Math.random() * 0.001;
    this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.target = null;
    this.color = `hsla(0deg, 0%, ${Math.random() * 100}%, 0.9)`;

    // 이미지 랜덤 선택
    this.textureIndex = Math.floor(Math.random() * textures.length);
    this.texture = textures[this.textureIndex];

    const imgNumber = this.textureIndex + 1;
    this.textureScale = TEXTURE_SCALE[imgNumber] ?? 1.0;

    // --- 사이즈 관련 초기화 ---
    this.baseSize = this.getSize(1);
    this.size = this.baseSize;

    this.sizeOrig = this.size;
    this.sizeTarget = this.size;
    this.sizeState = 'idle';
    this.sizePhase = 0;
    this.sizeHold = 0;

    // --- wander 관련 상태 (연속 이동 + 부드러운 방향 회전) ---
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderAngleStart = this.wanderAngle;
    this.wanderAngleTarget = this.wanderAngle;
    this.wanderAnglePhase = 1; // 처음 프레임에 새 타겟을 잡도록
    this.wanderDuration = 60 + Math.floor(Math.random() * 180); // 1~4초
    this.wanderSpeed = 0.0005 + Math.random() * 0.0015; // 기본 속도

    // --- align 관련 상태 ---
    this.alignPhase = 0; // 0 ~ 1 (타겟까지 붙는 애니메이션)
    this.alignStartPos = this.pos.clone();
    this.alignSettled = false; // 타겟에 붙은 이후인지
    this.alignTime = 0; // hover용 시간
    this.alignHoverRadius = 0.01 + Math.random() * 0.01; // 주변에서 떠다니는 반경
    this.alignHoverSpeedX = 0.01 + Math.random() * 0.03;
    this.alignHoverSpeedY = 0.01 + Math.random() * 0.03;
    this.alignHoverPhase = Math.random() * Math.PI * 2;
  }

  setTarget(vec) {
    this.target = vec.clone();
    this.alignPhase = 0;
    this.alignStartPos = this.pos.clone();
    this.alignSettled = false;
    this.alignTime = 0;
  }

  clearTarget() {
    this.target = null;
  }

  update(mode) {
    if (mode === 'wander' || !this.target) {
      this.updateWander();
    } else {
      this.updateAlign();
    }
    this.updateSize();
  }

  // --- wander: 쉬지 않고 계속 부드럽게 방향을 바꿔가며 돌아다니기 ---
  updateWander() {
    // 각도 보간 구간이 끝났으면 새 목표 각도 설정
    if (this.wanderAnglePhase >= 1) {
      this.wanderAnglePhase = 0;
      this.wanderAngleStart = this.wanderAngleTarget;

      // 현재 각도에서 -45도 ~ +45도 사이로 살짝 방향 틀기
      const delta = (Math.random() - 0.5) * (Math.PI / 2);
      this.wanderAngleTarget = this.wanderAngleStart + delta;

      // 속도/지속시간도 약간씩 갱신해서 너무 패턴 같지 않게
      this.wanderSpeed = 0.0005 + Math.random() * 0.0015;
      this.wanderDuration = 60 + Math.floor(Math.random() * 180); // 1~4초
    }

    // phase 0 → 1
    this.wanderAnglePhase += 1 / this.wanderDuration;
    if (this.wanderAnglePhase > 1) this.wanderAnglePhase = 1;

    const t = easeout(this.wanderAnglePhase);
    const angle =
      this.wanderAngleStart +
      (this.wanderAngleTarget - this.wanderAngleStart) * t;
    this.wanderAngle = angle;

    // 해당 각도 기준으로 방향/속도 계산
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    this.vel.x = dirX * this.wanderSpeed;
    this.vel.y = dirY * this.wanderSpeed;

    // 위치 업데이트
    this.pos.add(this.vel);

    // 경계 처리: 튕기되 떨림 없이 방향만 바꿔주기
    const margin = 0.05;
    let bounced = false;

    if (this.pos.x < -1 - margin) {
      this.pos.x = -1 - margin;
      this.vel.x *= -1;
      bounced = true;
    } else if (this.pos.x > 1 + margin) {
      this.pos.x = 1 + margin;
      this.vel.x *= -1;
      bounced = true;
    }

    if (this.pos.y < -1 - margin) {
      this.pos.y = -1 - margin;
      this.vel.y *= -1;
      bounced = true;
    } else if (this.pos.y > 1 + margin) {
      this.pos.y = 1 + margin;
      this.vel.y *= -1;
      bounced = true;
    }

    if (bounced) {
      // 튕긴 방향 기준으로 다시 각도/보간 초기화
      this.wanderAngle = Math.atan2(this.vel.y, this.vel.x);
      this.wanderAngleStart = this.wanderAngle;
      this.wanderAngleTarget = this.wanderAngle;
      this.wanderAnglePhase = 1; // 다음 프레임에 새로운 타겟 각도 설정
    }
  }

  // --- align: 타겟까지 easeout으로 붙고, 그 주변에서만 살짝 떠다니기 ---
  updateAlign() {
    if (!this.target) {
      // 타겟 없으면 그냥 wander
      this.updateWander();
      return;
    }

    const tx = this.target.x;
    const ty = this.target.y;

    if (!this.alignSettled) {
      // 타겟까지 붙는 중
      this.alignPhase += 1 / 30; // 약 0.5~1초 정도
      if (this.alignPhase > 1) this.alignPhase = 1;

      const t = easeout(this.alignPhase);

      const sx = this.alignStartPos.x;
      const sy = this.alignStartPos.y;

      this.pos.x = sx + (tx - sx) * t;
      this.pos.y = sy + (ty - sy) * t;

      if (this.alignPhase >= 1) {
        this.alignSettled = true;
        this.alignTime = 0;
        this.pos.x = tx;
        this.pos.y = ty;
      }
    } else {
      // 타겟 주변에서만 살짝 둥실둥실
      this.alignTime++;

      const t = this.alignTime;
      const ox =
        Math.sin(t * this.alignHoverSpeedX + this.alignHoverPhase) *
        this.alignHoverRadius;
      const oy =
        Math.cos(t * this.alignHoverSpeedY + this.alignHoverPhase * 0.7) *
        this.alignHoverRadius;

      this.pos.x = tx + ox;
      this.pos.y = ty + oy;
    }
  }

  updateSize() {
    const MAX_PULSE = Entity.MAX_PULSE;
    const ANIM_FRAMES = 30; // 커졌다/줄어드는 데 걸리는 프레임 수 (0.5초 정도)
    const HOLD_FRAMES = 300; // 크게 유지하는 프레임 수 (약 5초)

    // 사이즈 상태에 따라 동작
    switch (this.sizeState) {
      case 'idle': {
        // 기본 크기 유지
        this.size = this.baseSize;

        // 아직 펄스 중인 엔티티가 충분히 적고, 랜덤 확률로 트리거
        if (Entity.activeCount < MAX_PULSE && Math.random() < 0.002) {
          this.sizeState = 'growing';
          this.sizePhase = 0;
          this.sizeOrig = this.baseSize;
          this.sizeTarget = this.getSize(5); // 크게 키우기
          Entity.activeCount++;
        }
        break;
      }

      case 'growing': {
        this.sizePhase += 1 / ANIM_FRAMES;
        if (this.sizePhase >= 1) {
          this.sizePhase = 1;
          this.sizeState = 'holding';
          this.sizeHold = 0;
        }
        this.applySizeLerp();
        break;
      }

      case 'holding': {
        this.sizeHold++;
        this.size = this.sizeTarget; // 그대로 유지

        if (this.sizeHold >= HOLD_FRAMES) {
          // 줄어들 준비
          this.sizeState = 'shrinking';
          this.sizePhase = 0;
          this.sizeOrig = this.sizeTarget;
          this.sizeTarget = this.baseSize; // 다시 기본 크기로
        }
        break;
      }

      case 'shrinking': {
        this.sizePhase += 1 / ANIM_FRAMES;
        if (this.sizePhase >= 1) {
          this.sizePhase = 1;
          this.sizeState = 'idle';
          this.size = this.baseSize;
          Entity.activeCount = Math.max(0, Entity.activeCount - 1);
        } else {
          this.applySizeLerp();
        }
        break;
      }
    }
  }

  getSize(x = 1) {
    return 50 * Math.random() * x;
  }

  draw(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const x = ((this.pos.x + 1) / 2) * w;
    const y = ((this.pos.y + 1) / 2) * h;

    const img = this.texture;
    if (!img.complete) return; // 아직 안 불러와졌으면 pass

    const size = this.size * (this.textureScale ?? 1.0);

    // 이미지 비율 유지
    const aspect = img.width / img.height;
    let drawW, drawH;

    if (aspect >= 1) {
      drawW = size;
      drawH = size / aspect;
    } else {
      drawH = size;
      drawW = size * aspect;
    }

    ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
  }

  applySizeLerp() {
    // phase 는 0 ~ 1, easeout 으로 자연스럽게 보간
    const t = easeout(Math.min(1, Math.max(0, this.sizePhase)));
    this.size = this.sizeOrig + (this.sizeTarget - this.sizeOrig) * t;
  }
}
