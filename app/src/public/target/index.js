import DrawingShape from '../drawing-shape.js';
import WebsocketClient from '../websocket-client.mjs';
import { easeout } from '../bezier.js';

// 아이패드 정렬용 기준 화면 비율 (width / height)
const DESIGN_ASPECT = 4 / 3;

// 이미지 개수
const IMG_COUNT = 18;
// 이미지 저장 배열
const textures = [];

// 이미지별 사이즈 배율 테이블
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

// 이미지 로드 함수
function loadTextures() {
  for (let i = 1; i <= IMG_COUNT; i++) {
    const img = new Image();
    img.src = `/assets/images/ahn-png/ahn-${i}.png`;
    textures.push(img);
  }
}
loadTextures();

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

class Entity {
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

    // --- life(등장/퇴장) 관련 상태 ---
    this.lifeState = 'normal'; // 'appearing' | 'normal' | 'disappearing'
    this.lifePhase = 1; // 0~1
    this.isDead = false; // 삭제 예정 플래그
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
    this.updateLife();

    if (this.isDead) return;

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
      this.wanderAngle = Math.atan2(this.vel.y, this.vel.x);
      this.wanderAngleStart = this.wanderAngle;
      this.wanderAngleTarget = this.wanderAngle;
      this.wanderAnglePhase = 1;
    }
  }

  // --- align: 타겟까지 easeout으로 붙고, 그 주변에서만 살짝 떠다니기 ---
  updateAlign() {
    if (!this.target) {
      this.updateWander();
      return;
    }

    const tx = this.target.x;
    const ty = this.target.y;

    if (!this.alignSettled) {
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
    const ANIM_FRAMES = 30;
    const HOLD_FRAMES = 300;

    switch (this.sizeState) {
      case 'idle': {
        this.size = this.baseSize;

        if (Entity.activeCount < MAX_PULSE && Math.random() < 0.002) {
          this.sizeState = 'growing';
          this.sizePhase = 0;
          this.sizeOrig = this.baseSize;
          this.sizeTarget = this.getSize(10);
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
          if (Entity.activeCount > 0) {
            Entity.activeCount--;
          }
        } else {
          this.applySizeLerp();
        }
        break;
      }
    }
  }

  getSize(x = 1) {
    let base = 20;
    let multi = 20;
    let size = Math.random() * x;
    return size * multi + base;
  }

  draw(ctx, mode, viewAlign) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;

    const img = this.texture;
    if (!img.complete) return;

    // --- 두 가지 좌표계에서 화면 좌표 계산 ---
    // 1) wander 스타일 맵핑 (전체 캔버스)
    const xWander = ((this.pos.x + 1) / 2) * w;
    const yWander = ((this.pos.y + 1) / 2) * h;

    // 2) align 스타일 맵핑 (아이패드 4:3 영역)
    const designAspect = DESIGN_ASPECT;
    const scale = Math.min(w / (2 * designAspect), h / 2);
    const centerX = w / 2;
    const centerY = h / 2;
    const u = this.pos.x * designAspect;
    const v = this.pos.y;
    const xAlign = centerX + u * scale;
    const yAlign = centerY + v * scale;

    // viewAlign(0~1)에 따라 두 좌표계를 부드럽게 섞기
    const tView = viewAlign; // 0 = wander 방식, 1 = align 방식
    const x = xWander + (xAlign - xWander) * tView;
    const y = yWander + (yAlign - yWander) * tView;

    // === 여기부터 크기 계산 ===
    const lifeScale = this.getLifeScale();
    if (lifeScale <= 0) return;

    const size = this.size * (this.textureScale ?? 1.0) * lifeScale;

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
    const t = easeout(Math.min(1, Math.max(0, this.sizePhase)));
    this.size = this.sizeOrig + (this.sizeTarget - this.sizeOrig) * t;
  }

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
}
Entity.activeCount = 0;
Entity.MAX_PULSE = 5;

let wsc;
let shapes = [];
const ENT_COUNT = 200;
const MIN_ENTITIES = 20;
const MAX_ENTITIES = 1000;
const ENTITIES_PER_UNIT = 25;
let entities = [];
let mode = 'wander';

// 뷰 전환용 보간값 (0: wander 좌표계, 1: align 좌표계)
let viewAlign = 0;
let viewAlignTarget = 0;

// 🆕 addpoint로 들어온 마지막 좌표 기억
let lastInputPoint = null;

const canvas = document.querySelector('#canvas');
canvas.width = canvas.offsetWidth * 2;
canvas.height = canvas.offsetHeight * 2;
const ctx = canvas.getContext('2d');

function frame() {
  draw();
  window.requestAnimationFrame(frame);
}
window.requestAnimationFrame(frame);

function draw() {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  // viewAlign을 타겟(viewAlignTarget) 쪽으로 부드럽게 보간
  viewAlign += (viewAlignTarget - viewAlign) * 0.1;
  if (Math.abs(viewAlignTarget - viewAlign) < 0.001) {
    viewAlign = viewAlignTarget;
  }

  ctx.clearRect(0, 0, w, h);

  entities.forEach((ent) => {
    ent.update(mode);
    ent.draw(ctx, mode, viewAlign);
  });

  entities = entities.filter((ent) => !ent.isDead);
}

// 새로 추가: 스트로크 하나당 할당할 점 개수
const POINTS_PER_STROKE = 2;

function applyShapeToEntities() {
  // 1) 도형이 없으면: 그냥 wander 모드
  if (!shapes || shapes.length === 0) {
    mode = 'wander';
    viewAlignTarget = 0; // 화면 좌표도 다시 전체 캔버스로 서서히 전환

    entities.forEach((ent) => {
      ent.clearTarget();
    });

    setEntityCount(ENT_COUNT);
    return;
  }

  // 2) 도형이 있을 때만 align 모드 + 패스 기반 개수 조절
  mode = 'align';
  viewAlignTarget = 1; // 화면 좌표를 아이패드 4:3 기준으로 서서히

  const shapeDistances = shapes.map((shape) => shape.distance || 0);
  const totalDist = shapeDistances.reduce((sum, d) => sum + d, 0);

  // === (A) 아주 짧은 패스인 경우: 한 점 주변에 클러스터처럼 모이도록 ===
  const EPS = 0.001; // 🆕 살짝 여유 있게 키워줌
  if (totalDist < EPS) {
    const lastShape = shapes[shapes.length - 1];
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

    // 🆕 위에서 center를 못 잡았으면, 마지막 addpoint 좌표라도 사용
    if (lastInputPoint) {
      center = { x: lastInputPoint.x, y: lastInputPoint.y };
    }

    // 그래도 혹시 모르니 center.x/y가 숫자가 아닐 경우 대비
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
      center = { x: 0, y: 0 };
    }

    // 짧은 패스일 때도 최소 개수는 유지
    setEntityCount(MIN_ENTITIES);

    // 🆕 반경도 좀 더 키워서 "확실히 보이게" 퍼뜨리기
    const CLUSTER_RADIUS = 0.08; // 이전 0.02 → 0.08 정도로
    entities.forEach((ent) => {
      const r = CLUSTER_RADIUS * Math.sqrt(Math.random()); // 중심에 너무 몰리지 않게
      const ang = Math.random() * Math.PI * 2;
      const jx = center.x + Math.cos(ang) * r;
      const jy = center.y + Math.sin(ang) * r;
      ent.setTarget(new Vector(jx, jy));
    });

    return;
  }

  const targets = [];

  // 패스 길이에 따라 엔티티 수 결정
  let desiredCount = Math.round(totalDist * ENTITIES_PER_UNIT);
  desiredCount = Math.max(MIN_ENTITIES, Math.min(MAX_ENTITIES, desiredCount));
  setEntityCount(desiredCount);

  for (let i = 0; i < entities.length; i++) {
    const d =
      entities.length > 1
        ? (i / (entities.length - 1)) * totalDist
        : totalDist / 2;

    let accDist = 0;
    let pos = null;

    for (let sIndex = 0; sIndex < shapes.length; sIndex++) {
      const shapeDist = shapeDistances[sIndex];
      if (d <= accDist + shapeDist) {
        const localDist = d - accDist;
        const shape = shapes[sIndex];

        let accStrokeDist = 0;
        for (const stroke of shape.strokes) {
          const sLen = stroke.length || 0;
          if (localDist <= accStrokeDist + sLen) {
            const rel = (localDist - accStrokeDist) / (sLen || 1);
            const p = stroke.posAt(rel);
            pos = p;
            break;
          }
          accStrokeDist += sLen;
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
      const lastShape = shapes[shapes.length - 1];
      if (lastShape.strokes && lastShape.strokes.length > 0) {
        pos = lastShape.strokes[0].from;
      } else {
        pos = { x: 0, y: 0 };
      }
    }

    targets.push(new Vector(pos.x, pos.y));
  }

  const shuffled = targets.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  for (let i = 0; i < entities.length; i++) {
    entities[i].setTarget(shuffled[i]);
  }
}

function setEntityCount(targetCount) {
  targetCount = Math.max(0, Math.floor(targetCount));
  targetCount = Math.min(MAX_ENTITIES, targetCount);

  const current = entities.length;

  if (targetCount === current) return;

  if (targetCount > current) {
    const toAdd = targetCount - current;
    for (let i = 0; i < toAdd; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      const ent = new Entity(x, y);
      ent.lifeState = 'appearing';
      ent.lifePhase = 0;
      entities.push(ent);
    }
  } else {
    const toRemove = current - targetCount;

    const indices = entities.map((_, idx) => idx);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }

    let removed = 0;
    for (let i = 0; i < indices.length && removed < toRemove; i++) {
      const ent = entities[indices[i]];
      if (!ent || ent.lifeState === 'disappearing') continue;

      // 🆕 만약 이 엔티티가 펄스 중이었다면 activeCount 정리
      if (ent.sizeState !== 'idle') {
        ent.sizeState = 'idle';
        ent.size = ent.baseSize;
        if (Entity.activeCount > 0) {
          Entity.activeCount--;
        }
      }

      ent.lifeState = 'disappearing';
      ent.lifePhase = 0;
      removed++;
    }
  }
}

function init() {
  wsc = new WebsocketClient('/target');
  wsc.on('open', () => {
    wsc.event('sync');
  });
  wsc.on('json', (con, event, data) => {
    if (event === 'sync') {
      shapes = [];
      data.forEach((shape) => {
        const ds = new DrawingShape(shape);
        shapes.push(ds);
      });
    } else if (event === 'newshape') {
      const ds = new DrawingShape();
      shapes.push(ds);
    } else if (event === 'addpoint') {
      // 🆕 마지막 입력 좌표 저장
      lastInputPoint = { x: data.x, y: data.y };

      let t = Math.max(10, data.r);
      shapes[shapes.length - 1].addPoint(data.x, data.y, t);
    }
    applyShapeToEntities();
  });
  wsc.open();

  function initEntities() {
    entities.length = 0;
    Entity.activeCount = 0; // 🆕 펄스 카운터도 리셋

    for (let i = 0; i < ENT_COUNT; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      entities.push(new Entity(x, y));
    }
  }
  initEntities();
}
init();

window.getShapes = () => {
  console.log(shapes);
};
