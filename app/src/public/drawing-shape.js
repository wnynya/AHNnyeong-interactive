'use strict';

class Stroke {
  constructor(from, to, duration = 1) {
    this.from = from;
    this.to = to;
    this.duration = duration;
  }

  get length() {
    const xl = this.to.x - this.from.x;
    const yl = this.to.y - this.from.y;
    return Math.hypot(xl, yl);
  }

  posAt(phase) {
    const p = Math.max(0, Math.min(1, phase));
    const x = this.from.x + (this.to.x - this.from.x) * p;
    const y = this.from.y + (this.to.y - this.from.y) * p;
    return { x, y };
  }

  toJSON() {
    return {
      from: this.from,
      to: this.to,
      duration: this.duration,
    };
  }
}

class DrawingShape {
  #strokes = [];
  #totalDuration = 0;
  #lastPoint = null;

  constructor(strokes = []) {
    strokes.forEach((stroke) => {
      this.#strokes.push(new Stroke(stroke.from, stroke.to, stroke.duration));
    });
  }

  addPoint(x, y, time = 1) {
    time = Math.max(1, time);
    const point = { x, y };
    if (this.#lastPoint) {
      const stroke = new Stroke(this.#lastPoint, point, time);
      this.#strokes.push(stroke);
      this.#totalDuration += time;
    }
    this.#lastPoint = point;
  }

  posAtPhase(phase) {
    if (this.#strokes.length === 0) {
      return { x: 0, y: 0 };
    }

    let p = phase % 1;
    if (p < 0) {
      p += 1;
    }

    let acc = 0;
    for (let i = 0; i < this.#strokes.length; i++) {
      const stroke = this.#strokes[i];
      const ratio = stroke.duration / this.#totalDuration;
      const next = acc + ratio;
      if (p <= next || i === this.#strokes.length - 1) {
        const localPhase = (p - acc) / (ratio || 1);
        return stroke.posAt(localPhase);
      }
      acc = next;
    }
  }

  posAtTime(time) {
    if (this.#strokes.length === 0) {
      return { x: 0, y: 0 };
    }
    if (this.#totalDuration <= 0) {
      return this.#strokes[0].from;
    }

    const t =
      ((time % this.#totalDuration) + this.#totalDuration) %
      this.#totalDuration;

    let acc = 0;
    for (let i = 0; i < this.#strokes.length; i++) {
      const stroke = this.#strokes[i];
      const next = acc + stroke.duration;
      if (t <= next || i === this.#strokes.length - 1) {
        const localPhase = (t - acc) / (stroke.duration || 1);
        return stroke.posAt(localPhase);
      }
      acc = next;
    }
  }

  get strokes() {
    return this.#strokes;
  }

  get length() {
    return this.#strokes.length;
  }

  get distance() {
    return this.#strokes.reduce((sum, s) => sum + s.length, 0);
  }

  get duration() {
    return this.#totalDuration;
  }

  toJSON() {
    const strokes = [];
    this.#strokes.forEach((stroke) => {
      strokes.push(stroke.toJSON());
    });
    return strokes;
  }
}

export default DrawingShape;
