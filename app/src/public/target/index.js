import DrawingShape from '../drawing-shape.js';
import WebsocketClient from '../websocket-client.mjs';
import { easeout } from '../bezier.js';

// 이미지 개수
const IMG_COUNT = 18;
// 이미지 저장 배열
const textures = [];

// 이미지별 사이즈 배율 테이블
// key: 파일 번호 (ahn-1.png → 1)
const TEXTURE_SCALE = {
  1: 1.0, // ahn-1.png
  2: 1.0, // ahn-2.png
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
  18: 1.0, // ahn-18.png
};
// 나중에 예: 5번 이미지만 좀 더 크게
// TEXTURE_SCALE[5] = 1.8;

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
  // 엔티티의 초기 위치는 정규화된 [-1,1] 범위
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

    // --- wander 관련 상태 ---
    this.wanderTime = 0;
    this.wanderDuration = 0;
    this.wanderDir = new Vector(1, 0); // 방향 단위 벡터
    this.wanderSpeed = 0.001; // 기본 속도

    this.wanderState = 'move'; // 'move' | 'rest'
    this.restTime = 0;
    this.restDuration = 0;

    this.pickNewWander(); // 첫 wander 방향 세팅

    // --- align 관련 상태 ---
    this.alignPhase = 0; // 0 ~ 1
    this.alignStartPos = this.pos.clone();
  }

  setTarget(vec) {
    this.target = vec.clone();
    this.alignPhase = 0;
    this.alignStartPos = this.pos.clone();
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

  updateWander() {
    if (this.wanderState === 'rest') {
      // 쉬는 중: 위치 안 바꾸고 시간만 흐르게
      this.restTime++;
      this.vel.x = 0;
      this.vel.y = 0;

      if (this.restTime > this.restDuration) {
        // 충분히 쉰 뒤 다시 이동 시작
        this.pickNewWander();
      }
      return;
    }

    // ===== 여기부터 'move' 상태 =====
    this.wanderTime++;

    // 시간이 다 됐거나, wanderDir이 없으면 한 번 이동 끝 → 쉬러 가기
    let endSegment = false;
    if (!this.wanderDir || this.wanderTime > this.wanderDuration) {
      endSegment = true;
    }

    // 0 ~ 1 사이의 phase
    const phase = Math.min(1, this.wanderTime / this.wanderDuration || 1);
    // 맨 처음 빠르게 → 끝으로 갈수록 천천히: easeout(1 - phase)
    const eased = easeout(1 - phase);

    // 완전 멈추진 않도록 0.3 ~ 1.0 범위로 속도 스케일
    const speed = this.wanderSpeed * (0.3 + 0.7 * eased);

    // 현재 방향에 easeout 적용된 속도 반영
    this.vel.x = this.wanderDir.x * speed;
    this.vel.y = this.wanderDir.y * speed;

    // 위치 업데이트
    this.pos.add(this.vel);

    // 경계 [-1, 1]을 넘으면 "벽에 부딪힌 것처럼" 쉬러 가기
    if (
      this.pos.x < -1 ||
      this.pos.x > 1 ||
      this.pos.y < -1 ||
      this.pos.y > 1
    ) {
      endSegment = true;
    }

    const margin = 0.05;
    this.pos.x = Math.max(-1 - margin, Math.min(1 + margin, this.pos.x));
    this.pos.y = Math.max(-1 - margin, Math.min(1 + margin, this.pos.y));

    if (endSegment) {
      this.enterRest();
    }
  }

  updateAlign() {
    // 타겟 없으면 wander 로
    if (!this.target) {
      this.updateWander();
      return;
    }

    // phase 증가 (대략 0.5초~1초 정도에 맞게 조절)
    this.alignPhase += 1 / 30; // 30프레임 동안 0→1
    if (this.alignPhase > 1) this.alignPhase = 1;

    const t = easeout(this.alignPhase); // 0~1 → easeout 적용

    // 시작점에서 타겟까지 easeout 으로 위치 보간
    const sx = this.alignStartPos.x;
    const sy = this.alignStartPos.y;
    const tx = this.target.x;
    const ty = this.target.y;

    this.pos.x = sx + (tx - sx) * t;
    this.pos.y = sy + (ty - sy) * t;

    // 약간의 랜덤 흔들림
    if (Math.random() > 0.95) {
      this.pos.x += (Math.random() - 0.5) * 0.005;
      this.pos.y += (Math.random() - 0.5) * 0.005;
    }

    // 타겟과의 거리 측정해서 충분히 가까우면 다시 wander로
    const dx = tx - this.pos.x;
    const dy = ty - this.pos.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.01) {
      this.clearTarget();
      this.pickNewWander();
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

  pickNewWander() {
    const angle = Math.random() * Math.PI * 2;
    // 살살 움직이는 기본 속도
    const speed = 0.0005 + Math.random() * 0.0015;

    // 단위 방향 + 기본 속도 분리해서 저장
    this.wanderDir = new Vector(Math.cos(angle), Math.sin(angle));
    this.wanderSpeed = speed;

    // 초기 vel 은 시작 시점에서 최대 속도 쪽으로
    this.vel.x = this.wanderDir.x * this.wanderSpeed;
    this.vel.y = this.wanderDir.y * this.wanderSpeed;

    // 1초 ~ 5초 정도 한 방향 유지
    this.wanderDuration = 60 + Math.floor(Math.random() * 240);
    this.wanderTime = 0;

    // 이동 상태로 전환
    this.wanderState = 'move';
  }

  enterRest() {
    this.wanderState = 'rest';
    this.restTime = 0;
    // 0.5초 ~ 3초 정도 쉼 (60fps 기준)
    this.restDuration = 30 + Math.floor(Math.random() * 150);
    this.vel.x = 0;
    this.vel.y = 0;
  }
}
Entity.activeCount = 0;
Entity.MAX_PULSE = 5; // 동시에 커질 수 있는 엔티티 수

let wsc;
let shapes = [];
const ENT_COUNT = 200;
let entities = [];
let mode = 'wander';
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

  ctx.clearRect(0, 0, w, h);
  // 도형은 정규화된 좌표를 픽셀로 변환하여 그림

  /*
  shapes.forEach((shape) => {
    if (shape.length > 1) {
      shape.strokes.forEach((stroke) => {
        const f = stroke.from;
        const fx = ((f.x + 1) / 2) * w;
        const fy = ((f.y + 1) / 2) * h;
        const t = stroke.to;
        const tx = ((t.x + 1) / 2) * w;
        const ty = ((t.y + 1) / 2) * h;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(tx, ty);
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.stroke();
      });
    }
  });
  */

  entities.forEach((ent) => {
    ent.update(mode);
    ent.draw(ctx);
  });
}

// 새로 추가: 스트로크 하나당 할당할 점 개수
const POINTS_PER_STROKE = 2;

function applyShapeToEntities() {
  if (!shapes || shapes.length == 0) {
    for (let i = 0; i < entities.length; i++) {
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      entities[i].setTarget(new Vector(x, y));
    }
    mode = 'align';
    return;
  }

  // 각 도형별 전체 길이(거리) 계산
  const shapeDistances = shapes.map((shape) => shape.distance || 0);
  const totalDist = shapeDistances.reduce((sum, d) => sum + d, 0);
  if (totalDist <= 0) return;

  const targets = [];

  // 모든 엔티티 수(ENT_COUNT)만큼 도형 전체에 균등하게 포인트를 샘플링
  for (let i = 0; i < entities.length; i++) {
    // 도형 전체 길이에 대한 누적 거리값
    const d = (i / (entities.length - 1)) * totalDist;
    let accDist = 0;
    let pos = null;

    for (let sIndex = 0; sIndex < shapes.length; sIndex++) {
      const shapeDist = shapeDistances[sIndex];
      if (d <= accDist + shapeDist) {
        // 해당 도형에서의 거리(localDist)를 구함
        const localDist = d - accDist;
        const shape = shapes[sIndex];

        // 도형 내부에서 원하는 지점을 찾기 위해 스트로크를 순회
        let accStrokeDist = 0;
        for (const stroke of shape.strokes) {
          const sLen = stroke.length || 0;
          if (localDist <= accStrokeDist + sLen) {
            // 현재 스트로크 내에서 비율(rel)을 계산하여 좌표를 얻음
            const rel = (localDist - accStrokeDist) / (sLen || 1);
            const p = stroke.posAt(rel);
            pos = p;
            break;
          }
          accStrokeDist += sLen;
        }

        // 혹시 못 찾았다면 마지막 스트로크의 끝점 사용
        if (!pos && shape.strokes.length > 0) {
          const lastStroke = shape.strokes[shape.strokes.length - 1];
          pos = lastStroke.to;
        }
        break;
      }
      accDist += shapeDist;
    }

    // 마지막 도형도 없다면 기본값
    if (!pos) {
      const lastShape = shapes[shapes.length - 1];
      if (lastShape.strokes && lastShape.strokes.length > 0) {
        pos = lastShape.strokes[0].from;
      } else {
        pos = { x: 0, y: 0 };
      }
    }

    // 각 엔티티에 정규화된 좌표를 직접 할당
    targets.push(new Vector(pos.x, pos.y));
  }

  // 필요하다면 targets 배열을 섞어 자연스럽게 보이도록 할 수 있습니다.
  const shuffled = targets.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  // 모든 엔티티에 타깃 좌표 할당
  for (let i = 0; i < entities.length; i++) {
    entities[i].setTarget(shuffled[i]);
  }
  mode = 'align';
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
      // 추가되는 점도 이미 정규화된 좌표라고 가정
      shapes[shapes.length - 1].addPoint(data.x, data.y, data.r);
    }
    // 도형 변경 시에만 타깃 업데이트
    applyShapeToEntities();
  });
  wsc.open();

  function initEntities() {
    entities.length = 0;
    for (let i = 0; i < ENT_COUNT; i++) {
      // 정규화된 [-1, 1] 범위에서 무작위 초기 위치
      const x = Math.random() * 2 - 1;
      const y = Math.random() * 2 - 1;
      entities.push(new Entity(x, y));
    }
  }
  initEntities();
}
init();
