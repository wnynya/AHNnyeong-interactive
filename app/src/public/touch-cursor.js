'use strict';

/**
 * touch-cursor.js
 *
 * @author Sungwan Jo <sung@wanyne.com> (https://wanyne.com)
 */

import EventEmitter from './eventemitter.mjs';

class TouchCursor extends EventEmitter {
  constructor(area, areaDeg = 0) {
    super();

    this.area = area;
    this.areaDeg = areaDeg;

    this.addEventListener();
  }

  addEventListener() {
    this.area.addEventListener('touchstart', (event) => {
      for (const touch of event.changedTouches) {
        const point = this.mapScreenPoint(touch.pageX, touch.pageY);
        this.emit('start', point);
      }
    });
    this.area.addEventListener('touchmove', (event) => {
      for (const touch of event.changedTouches) {
        const point = this.mapScreenPoint(touch.pageX, touch.pageY);
        this.emit('move', point);
      }
    });
    this.area.addEventListener('touchend', (event) => {
      for (const touch of event.changedTouches) {
        const point = this.mapScreenPoint(touch.pageX, touch.pageY);
        this.emit('end', point);
      }
    });
    this.area.addEventListener('touchcancel', (event) => {
      for (const touch of event.changedTouches) {
        const point = this.mapScreenPoint(touch.pageX, touch.pageY);
        this.emit('end', point);
      }
    });

    let mouse = false;
    this.area.addEventListener('mousedown', (event) => {
      mouse = true;
      const point = this.mapScreenPoint(event.pageX, event.pageY);
      this.emit('start', point);
    });
    document.body.addEventListener('mousemove', (event) => {
      if (mouse) {
        const point = this.mapScreenPoint(event.pageX, event.pageY);
        this.emit('move', point);
      }
    });
    document.body.addEventListener('mouseup', (event) => {
      if (mouse) {
        mouse = false;
        const point = this.mapScreenPoint(event.pageX, event.pageY);
        this.emit('end', point);
      }
    });
    document.body.addEventListener('mouseleave', (event) => {
      if (mouse) {
        mouse = false;
        const point = this.mapScreenPoint(event.pageX, event.pageY);
        this.emit('end', point);
      }
    });
  }

  rotatePoint(point, deg, center = [0, 0]) {
    const rad = (deg * Math.PI) / 180;
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    const x = point[0];
    const y = point[1];
    const cx = center[0];
    const cy = center[0];

    const dx = x - cx;
    const dy = y - cy;
    const nx = dx * c - dy * s + cx;
    const ny = dx * s + dy * c + cy;
    return { x: nx, y: ny };
  }

  mapScreenPoint(px, py) {
    const rect = this.area.getBoundingClientRect();
    const w = this.area.offsetWidth;
    const h = this.area.offsetHeight;
    let tx = px - rect.left;
    let ty = py - rect.top;
    let x = (tx / w) * 2 - 1;
    let y = (ty / h) * 2 - 1;
    return this.rotatePoint([x, y], this.areaDeg);
  }
}

export default TouchCursor;
