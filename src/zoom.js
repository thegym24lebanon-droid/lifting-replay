export class ZoomState {
  constructor() { this.scale = 1; this.x = 0; this.y = 0; }
  clamp(width, height) {
    const maxX = width * (this.scale - 1) / 2, maxY = height * (this.scale - 1) / 2;
    this.x = Math.max(-maxX, Math.min(maxX, this.x));
    this.y = Math.max(-maxY, Math.min(maxY, this.y));
  }
  zoom(scale, anchorX, anchorY, width, height) {
    const next = Math.max(1, Math.min(6, scale)), ratio = next / this.scale;
    this.x = anchorX - (anchorX - this.x) * ratio;
    this.y = anchorY - (anchorY - this.y) * ratio;
    this.scale = next; this.clamp(width, height);
  }
  reset() { this.scale = 1; this.x = this.y = 0; }
}

export class ReplayZoom {
  constructor(viewport, canvas, { enabled, selecting, draft, select, changed }) {
    this.viewport = viewport; this.canvas = canvas; this.callbacks = { enabled, selecting, draft, select, changed };
    this.state = new ZoomState(); this.pointers = new Map(); this.multi = false;
    viewport.addEventListener('pointerdown', e => this.down(e));
    viewport.addEventListener('pointermove', e => this.move(e));
    viewport.addEventListener('pointerup', e => this.up(e));
    viewport.addEventListener('pointercancel', e => this.up(e, true));
    viewport.addEventListener('lostpointercapture', e => this.up(e, true));
    viewport.addEventListener('contextmenu', e => { if (enabled()) e.preventDefault(); });
    viewport.addEventListener('wheel', e => {
      if (!enabled()) return;
      e.preventDefault(); const rect = viewport.getBoundingClientRect();
      this.state.zoom(this.state.scale * Math.exp(-e.deltaY * .002), e.clientX - rect.left - rect.width / 2, e.clientY - rect.top - rect.height / 2, rect.width, rect.height);
      this.render();
    }, { passive: false });
    new ResizeObserver(() => this.render()).observe(viewport);
    this.render();
  }
  baseline() {
    const points = [...this.pointers.values()];
    this.gesture = { scale: this.state.scale, x: this.state.x, y: this.state.y, points: points.map(p => ({ ...p })) };
  }
  down(event) {
    if (!this.callbacks.enabled() || event.button > 0) return;
    event.preventDefault(); this.viewport.setPointerCapture(event.pointerId);
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (this.pointers.size > 1) { this.multi = true; this.callbacks.draft(null); }
    this.baseline();
    if (this.pointers.size === 1 && !this.multi && this.callbacks.selecting()) this.callbacks.draft({ x: event.clientX, y: event.clientY });
  }
  move(event) {
    if (!this.pointers.has(event.pointerId)) return;
    event.preventDefault(); this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const points = [...this.pointers.values()], initial = this.gesture;
    if (points.length >= 2) {
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      const oldDistance = Math.max(1, Math.hypot(initial.points[0].x - initial.points[1].x, initial.points[0].y - initial.points[1].y));
      const rect = this.viewport.getBoundingClientRect();
      const oldX = (initial.points[0].x + initial.points[1].x) / 2 - rect.left - rect.width / 2;
      const oldY = (initial.points[0].y + initial.points[1].y) / 2 - rect.top - rect.height / 2;
      this.state.scale = initial.scale; this.state.x = initial.x; this.state.y = initial.y;
      this.state.zoom(initial.scale * distance / oldDistance, oldX, oldY, rect.width, rect.height);
      this.state.x += (points[0].x + points[1].x - initial.points[0].x - initial.points[1].x) / 2;
      this.state.y += (points[0].y + points[1].y - initial.points[0].y - initial.points[1].y) / 2;
      this.state.clamp(rect.width, rect.height); this.render();
    } else if (this.callbacks.selecting() && !this.multi) {
      this.callbacks.draft({ x: event.clientX, y: event.clientY });
    } else {
      this.state.x = initial.x + points[0].x - initial.points[0].x;
      this.state.y = initial.y + points[0].y - initial.points[0].y;
      this.render();
    }
  }
  up(event, cancelled = false) {
    if (!this.pointers.has(event.pointerId)) return;
    const select = !cancelled && !this.multi && this.pointers.size === 1 && this.callbacks.selecting();
    this.pointers.delete(event.pointerId);
    if (this.viewport.hasPointerCapture(event.pointerId)) this.viewport.releasePointerCapture(event.pointerId);
    if (select) this.callbacks.select({ x: event.clientX, y: event.clientY });
    if (cancelled) this.callbacks.draft(null);
    if (!this.pointers.size) { this.multi = false; this.gesture = null; }
    else this.baseline();
  }
  zoom(factor) {
    const rect = this.viewport.getBoundingClientRect();
    this.state.zoom(this.state.scale * factor, 0, 0, rect.width, rect.height); this.render();
  }
  reset() { this.pointers.clear(); this.multi = false; this.state.reset(); this.callbacks.draft(null); this.render(); }
  render() {
    const rect = this.viewport.getBoundingClientRect();
    this.state.clamp(rect.width, rect.height);
    this.canvas.style.transform = `translate(${this.state.x}px, ${this.state.y}px) scale(${this.state.scale})`;
    this.viewport.dataset.zoom = this.state.scale.toFixed(2);
    this.callbacks.changed?.(this.state.scale);
  }
}
