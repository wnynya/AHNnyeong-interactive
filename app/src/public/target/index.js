import DrawingShape from '../drawing-shape.js';
import WebsocketClient from '../websocket-client.mjs';
import { easeout } from '../bezier.js';

/* ============================================================================
 * 1. 상수 / 설정
 * ==========================================================================*/

// 아이패드 정렬용 기준 화면 비율 (width / height)
const DESIGN_ASPECT = 4 / 3;

// 이미지 관련
const IMG_COUNT = 18;
const TEXTURE_SCALE = {
  1: 1.0,
  2: 1.0,
  3: 1.0,
  4: 1.0,
  5: 1.0,
  6: 1.0,
  7: 1.0,
  8: 1.0,
  9: 1.0,
  10: 1.0,
  11: 1.0,
  12: 1.0,
  13: 1.0,
  14: 1.0,
  15: 1.0,
  16: 1.0,
  17: 1.0,
  18: 1.0,
};

// 엔티티 개수 관련
const INITIAL_ENTITY_COUNT = 70;
const MIN_ENTITY_COUNT = 10;
const MAX_ENTITY_COUNT = 1000;
const ENTITIES_PER_UNIT_LENGTH = 25; // 패스 길이당 엔티티 밀도

// 펄스(커졌다 줄어드는 효과) 관련
const MAX_PULSE = 5; // 동시에 펄스 날 엔티티 수
let pulseCount = 0; // 현재 프레임 기준 펄스 중인 엔티티 수

// 짧은 패스 감지 / 클러스터 표시 관련
const SHORT_PATH_EPS = 0.001;
const CLUSTER_RADIUS = 0.08; // 짧은 패스일 때 한 점 주변에 퍼뜨릴 반경

// 뷰(좌표계) 전환 관련: 0 = wander, 1 = align
const VIEW_BLEND_LERP = 0.1;

/* ============================================================================
 * 2. 이미지 로드
 * ==========================================================================*/

const textures = [];

function loadTextures() {
  for (let i = 1; i <= IMG_COUNT; i++) {
    const img = new Image();
    img.src = `/assets/images/ahn-png/ahn-${i}.png`;
    textures.push(img);
  }
}
loadTextures();

/* ============================================================================
 * 3. 유틸리티: Vector
 * ==========================================================================*/

class Vector {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  clone() {
    return new Vector(this.x, this.y);
  }

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mul(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  normalize() {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  lerpTo(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  static sub(a, b) {
    return new Vector(a.x - b.x, a.y - b.y);
  }
}

/* ============================================================================
 * 4. Entity 클래스
 * ==========================================================================*/

class Entity {
  constructor(x, y) {
    // 위치 / 속도
    this.pos = new Vector(x, y);
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.001 + Math.random() * 0.001;
    this.vel = new Vector(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.target = null;

    // 비주얼
    this.color = `hsla(0deg, 0%, ${Math.random() * 100}%, 0.9)`;
    this.textureIndex = Math.floor(Math.random() * textures.length);
    this.texture = textures[this.textureIndex];
    const imgNumber = this.textureIndex + 1;
    this.textureScale = TEXTURE_SCALE[imgNumber] ?? 1.0;

    // 사이즈 / 펄스 관련
    this.baseSize = this.getRandomSize(1);
    this.size = this.baseSize;

    this.sizeOrig = this.size;
    this.sizeTarget = this.size;
    this.sizeState = 'idle'; // idle | growing | holding | shrinking
    this.sizePhase = 0;
    this.sizeHold = 0;

    // wander 상태
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.wanderAngleStart = this.wanderAngle;
    this.wanderAngleTarget = this.wanderAngle;
    this.wanderAnglePhase = 1;
    this.wanderDuration = 60 + Math.floor(Math.random() * 180); // 1~4초
    this.wanderSpeed = 0.0005 + Math.random() * 0.0015;

    // align 상태
    this.alignPhase = 0;
    this.alignStartPos = this.pos.clone();
    this.alignSettled = false;
    this.alignTime = 0;
    this.alignHoverRadius = 0.01 + Math.random() * 0.01;
    this.alignHoverSpeedX = 0.01 + Math.random() * 0.03;
    this.alignHoverSpeedY = 0.01 + Math.random() * 0.03;
    this.alignHoverPhase = Math.random() * Math.PI * 2;

    // life(등장/퇴장)
    this.lifeState = 'normal'; // appearing | normal | disappearing
    this.lifePhase = 1;
    this.isDead = false;
  }

  /* -------------------- 타깃 / 모드 업데이트 -------------------- */

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
    this.updateLife();

    if (this.isDead) return;

    if (mode === 'wander' || !this.target) {
      this.updateWander();
    } else {
      this.updateAlign();
    }

    this.updateSize();
  }

  /* -------------------- Wander 모드 -------------------- */

  updateWander() {
    // 방향 보간이 끝났으면 새 목표 방향
    if (this.wanderAnglePhase >= 1) {
      this.wanderAnglePhase = 0;
      this.wanderAngleStart = this.wanderAngleTarget;

      const delta = (Math.random() - 0.5) * (Math.PI / 2); // -45° ~ +45°
      this.wanderAngleTarget = this.wanderAngleStart + delta;

      this.wanderSpeed = 0.0005 + Math.random() * 0.0015;
      this.wanderDuration = 60 + Math.floor(Math.random() * 180);
    }

    this.wanderAnglePhase += 1 / this.wanderDuration;
    if (this.wanderAnglePhase > 1) this.wanderAnglePhase = 1;

    const t = easeout(this.wanderAnglePhase);
    const angle =
      this.wanderAngleStart +
      (this.wanderAngleTarget - this.wanderAngleStart) * t;
    this.wanderAngle = angle;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    this.vel.x = dirX * this.wanderSpeed;
    this.vel.y = dirY * this.wanderSpeed;

    this.pos.add(this.vel);

    // 경계 처리
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
      this.wanderAngle = Math.atan2(this.vel.y, this.vel.x);
      this.wanderAngleStart = this.wanderAngle;
      this.wanderAngleTarget = this.wanderAngle;
      this.wanderAnglePhase = 1;
    }
  }

  /* -------------------- Align 모드 -------------------- */

  updateAlign() {
    if (!this.target) {
      this.updateWander();
      return;
    }

    const tx = this.target.x;
    const ty = this.target.y;

    if (!this.alignSettled) {
      // 타겟까지 붙는 애니메이션
      this.alignPhase += 1 / 30; // 약 0.5~1초
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
      // 타겟 주변에서 둥실둥실
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

  /* -------------------- 펄스(사이즈) 업데이트 -------------------- */

  updateSize() {
    const ANIM_FRAMES = 30;
    const HOLD_FRAMES = 300;

    switch (this.sizeState) {
      case 'idle': {
        this.size = this.baseSize;

        // 현재 펄스 중인 개수 + 랜덤 확률로 새 펄스 시작
        if (pulseCount < MAX_PULSE && Math.random() < 0.002) {
          this.sizeState = 'growing';
          this.sizePhase = 0;
          this.sizeOrig = this.baseSize;
          this.sizeTarget = this.getRandomSize(20);
          pulseCount++;
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
        this.size = this.sizeTarget;

        if (this.sizeHold >= HOLD_FRAMES) {
          this.sizeState = 'shrinking';
          this.sizePhase = 0;
          this.sizeOrig = this.sizeTarget;
          this.sizeTarget = this.baseSize;
        }
        break;
      }

      case 'shrinking': {
        this.sizePhase += 1 / ANIM_FRAMES;
        if (this.sizePhase >= 1) {
          this.sizePhase = 1;
          this.sizeState = 'idle';
          this.size = this.baseSize;
        } else {
          this.applySizeLerp();
        }
        break;
      }
    }
  }

  getRandomSize(multiplier = 1) {
    const base = 40;
    const scale = 20;
    const rand = Math.random() * multiplier;
    return rand * scale + base;
  }

  applySizeLerp() {
    const t = easeout(Math.min(1, Math.max(0, this.sizePhase)));
    this.size = this.sizeOrig + (this.sizeTarget - this.sizeOrig) * t;
  }

  /* -------------------- life(등장/퇴장) -------------------- */

  updateLife() {
    const LIFE_FRAMES = 30;

    if (this.lifeState === 'appearing') {
      this.lifePhase += 1 / LIFE_FRAMES;
      if (this.lifePhase >= 1) {
        this.lifePhase = 1;
        this.lifeState = 'normal';
      }
    } else if (this.lifeState === 'disappearing') {
      this.lifePhase += 1 / LIFE_FRAMES;
      if (this.lifePhase >= 1) {
        this.lifePhase = 1;
        this.isDead = true;
      }
    }
  }

  getLifeScale() {
    if (this.lifeState === 'normal') return 1;

    if (this.lifeState === 'appearing') {
      return easeout(this.lifePhase);
    }
    if (this.lifeState === 'disappearing') {
      return easeout(1 - this.lifePhase);
    }
    return 1;
  }

  /* -------------------- 렌더링 -------------------- */

  draw(ctx, mode, viewBlend) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const img = this.texture;
    if (!img.complete) return;

    // 1) wander 좌표계 (전체 캔버스 기준)
    const xWander = ((this.pos.x + 1) / 2) * w;
    const yWander = ((this.pos.y + 1) / 2) * h;

    // 2) align 좌표계 (4:3 영역 기준)
    const scale = Math.min(w / (2 * DESIGN_ASPECT), h / 2);
    const centerX = w / 2;
    const centerY = h / 2;
    const u = this.pos.x * DESIGN_ASPECT;
    const v = this.pos.y;
    const xAlign = centerX + u * scale;
    const yAlign = centerY + v * scale;

    // viewBlend(0~1)에 따라 두 좌표계 섞기
    const tView = viewBlend;
    const x = xWander + (xAlign - xWander) * tView;
    const y = yWander + (yAlign - yWander) * tView;

    const lifeScale = this.getLifeScale();
    if (lifeScale <= 0) return;

    const size = this.size * (this.textureScale ?? 1.0) * lifeScale;

    const aspect = img.width / img.height;
    let drawW;
    let drawH;

    if (aspect >= 1) {
      drawW = size;
      drawH = size / aspect;
    } else {
      drawH = size;
      drawW = size * aspect;
    }

    ctx.drawImage(img, x - drawW / 2, y - drawH / 2, drawW, drawH);
  }
}

/* ============================================================================
 * 5. 전역 상태
 * ==========================================================================*/

let websocket;
let drawingShapes = [];
let entities = [];

let currentMode = 'wander'; // 'wander' | 'align'

// 좌표계 전환 보간값 (0: wander, 1: align)
let viewBlend = 0;
let targetViewBlend = 0;

// addpoint로 들어온 마지막 좌표
let lastInputPoint = null;

const canvas = document.querySelector('#canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

/* ============================================================================
 * 6. 메인 렌더 루프
 * ==========================================================================*/

function renderLoop() {
  updateAndDrawFrame();
  window.requestAnimationFrame(renderLoop);
}
window.requestAnimationFrame(renderLoop);

function updateAndDrawFrame() {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // 뷰 보간
  viewBlend += (targetViewBlend - viewBlend) * VIEW_BLEND_LERP;
  if (Math.abs(targetViewBlend - viewBlend) < 0.001) {
    viewBlend = targetViewBlend;
  }

  ctx.clearRect(0, 0, w, h);

  // 현재 프레임 기준 펄스 중인 엔티티 수 계산
  pulseCount = 0;
  for (let i = 0; i < entities.length; i++) {
    if (entities[i].sizeState !== 'idle') {
      pulseCount++;
    }
  }

  // 엔티티 업데이트 & 렌더
  entities.forEach((entity) => {
    entity.update(currentMode);
    entity.draw(ctx, currentMode, viewBlend);
  });

  // 죽은 엔티티 제거
  entities = entities.filter((entity) => !entity.isDead);
}

/* ============================================================================
 * 7. 도형 → 엔티티 타겟 매핑
 * ==========================================================================*/

function updateEntitiesFromShapes() {
  // 도형이 없으면 wander 모드로 풀기
  if (!drawingShapes || drawingShapes.length === 0) {
    currentMode = 'wander';
    targetViewBlend = 0;

    entities.forEach((entity) => {
      entity.clearTarget();
    });

    setEntityCount(INITIAL_ENTITY_COUNT);
    return;
  }

  // 도형이 있을 때: align 모드 + 패스 길이에 따라 엔티티 개수 조절
  currentMode = 'align';
  targetViewBlend = 1;

  const shapeDistances = drawingShapes.map((shape) => shape.distance || 0);
  const totalDistance = shapeDistances.reduce((sum, d) => sum + d, 0);

  // 아주 짧은 패스: 한 점 주변에 클러스터처럼 모이기
  if (totalDistance < SHORT_PATH_EPS) {
    const lastShape = drawingShapes[drawingShapes.length - 1];
    let center = { x: 0, y: 0 };

    if (lastShape) {
      if (lastShape.strokes && lastShape.strokes.length > 0) {
        const lastStroke = lastShape.strokes[lastShape.strokes.length - 1];
        center = lastStroke.to || lastStroke.from || center;
      } else if (lastShape.points && lastShape.points.length > 0) {
        const p = lastShape.points[lastShape.points.length - 1];
        center = { x: p.x, y: p.y };
      }
    }

    // 그래도 못 잡으면 마지막 입력 좌표라도 사용
    if (lastInputPoint) {
      center = { x: lastInputPoint.x, y: lastInputPoint.y };
    }

    // 최후의 방어
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      center = { x: 0, y: 0 };
    }

    setEntityCount(MIN_ENTITY_COUNT);

    entities.forEach((entity) => {
      const r = CLUSTER_RADIUS * Math.sqrt(Math.random());
      const ang = Math.random() * Math.PI * 2;
      const jx = center.x + Math.cos(ang) * r;
      const jy = center.y + Math.sin(ang) * r;
      entity.setTarget(new Vector(jx, jy));
    });

    return;
  }

  // 패스 길이에 따라 엔티티 수 결정
  let desiredCount = Math.round(totalDistance * ENTITIES_PER_UNIT_LENGTH);
  desiredCount = Math.max(
    MIN_ENTITY_COUNT,
    Math.min(MAX_ENTITY_COUNT, desiredCount)
  );
  setEntityCount(desiredCount);

  // 전체 길이를 따라 균등하게 포인트 샘플링
  const targets = [];

  for (let i = 0; i < entities.length; i++) {
    const d =
      entities.length > 1
        ? (i / (entities.length - 1)) * totalDistance
        : totalDistance / 2;

    let accDist = 0;
    let pos = null;

    for (let sIndex = 0; sIndex < drawingShapes.length; sIndex++) {
      const shapeDist = shapeDistances[sIndex];

      if (d <= accDist + shapeDist) {
        const localDist = d - accDist;
        const shape = drawingShapes[sIndex];

        let accStrokeDist = 0;
        for (const stroke of shape.strokes) {
          const strokeLength = stroke.length || 0;

          if (localDist <= accStrokeDist + strokeLength) {
            const rel = (localDist - accStrokeDist) / (strokeLength || 1);
            const p = stroke.posAt(rel);
            pos = p;
            break;
          }
          accStrokeDist += strokeLength;
        }

        if (!pos && shape.strokes.length > 0) {
          const lastStroke = shape.strokes[shape.strokes.length - 1];
          pos = lastStroke.to;
        }
        break;
      }

      accDist += shapeDist;
    }

    if (!pos) {
      const lastShape = drawingShapes[drawingShapes.length - 1];
      if (lastShape.strokes && lastShape.strokes.length > 0) {
        pos = lastShape.strokes[0].from;
      } else {
        pos = { x: 0, y: 0 };
      }
    }

    targets.push(new Vector(pos.x, pos.y));
  }

  // 타깃 섞어서 조금 더 랜덤하게
  const shuffledTargets = targets.slice();
  for (let i = shuffledTargets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffledTargets[i], shuffledTargets[j]] = [
      shuffledTargets[j],
      shuffledTargets[i],
    ];
  }

  entities.forEach((entity, index) => {
    entity.setTarget(shuffledTargets[index]);
  });
}

/* ============================================================================
 * 8. 엔티티 개수 조절
 * ==========================================================================*/

function setEntityCount(targetCount) {
  targetCount = Math.max(0, Math.floor(targetCount));
  targetCount = Math.min(MAX_ENTITY_COUNT, targetCount);

  const currentCount = entities.length;
  if (targetCount === currentCount) return;

  if (targetCount > currentCount) {
    const toAdd = targetCount - currentCount;
    for (let i = 0; i < toAdd; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const entity = new Entity(x, y);
      entity.lifeState = 'appearing';
      entity.lifePhase = 0;
      entities.push(entity);
    }
  } else {
    const toRemove = currentCount - targetCount;

    const indices = entities.map((_, idx) => idx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let removed = 0;
    for (let i = 0; i < indices.length && removed < toRemove; i++) {
      const entity = entities[indices[i]];
      if (!entity || entity.lifeState === 'disappearing') continue;

      entity.lifeState = 'disappearing';
      entity.lifePhase = 0;
      removed++;
    }
  }
}

/* ============================================================================
 * 9. 초기화 / 웹소켓
 * ==========================================================================*/

function init() {
  initEntities();
  initWebsocket();
}

function initEntities() {
  entities.length = 0;

  for (let i = 0; i < INITIAL_ENTITY_COUNT; i++) {
    const x = Math.random() * 2 - 1;
    const y = Math.random() * 2 - 1;
    entities.push(new Entity(x, y));
  }
}

function initWebsocket() {
  websocket = new WebsocketClient('/target');

  websocket.on('open', () => {
    websocket.event('sync');
  });

  websocket.on('json', (con, event, data) => {
    if (event === 'sync') {
      drawingShapes = [];
      data.forEach((shape) => {
        const ds = new DrawingShape(shape);
        drawingShapes.push(ds);
      });
    } else if (event === 'newshape') {
      const ds = new DrawingShape();
      drawingShapes.push(ds);
    } else if (event === 'addpoint') {
      lastInputPoint = { x: data.x, y: data.y };

      const radius = Math.max(10, data.r);
      const currentShape = drawingShapes[drawingShapes.length - 1];
      if (currentShape) {
        currentShape.addPoint(data.x, data.y, radius);
      }
    } else if (event === 'refresh') {
      window.location.reload();
    }

    updateEntitiesFromShapes();
  });

  websocket.open();
}

init();

/* 디버깅용 */
window.getShapes = () => {
  console.log(drawingShapes);
};
