import { Vec2 } from '../core/math/vec2.js';
import { Pt, TransformContext, CoordinateSystem } from '../core/math/pt.js';

/**
 * Modern Pointer Events API wrapper providing unified multi-touch support.
 * Handles touch, mouse, and stylus input with high precision and cross-browser compatibility.
 * Based on the original Zotebook touch handling but enhanced for web platform capabilities.
 */

export enum PointerType {
  TOUCH = 'touch',
  MOUSE = 'mouse', 
  PEN = 'pen',
  UNKNOWN = 'unknown'
}

export enum PointerButton {
  NONE = -1,
  PRIMARY = 0,
  AUXILIARY = 1,
  SECONDARY = 2,
  FOURTH = 3,
  FIFTH = 4
}

export interface PointerState {
  readonly id: number;
  readonly type: PointerType;
  readonly position: Vec2;        // Screen coordinates
  readonly worldPosition: Pt;     // World coordinates with transform context
  readonly pressure: number;      // 0.0 to 1.0
  readonly tangentialPressure: number;
  readonly tiltX: number;         // -90 to 90 degrees
  readonly tiltY: number;         // -90 to 90 degrees
  readonly twist: number;         // 0 to 359 degrees
  readonly width: number;         // Contact area width
  readonly height: number;        // Contact area height
  readonly timestamp: number;     // High-precision timestamp
  readonly button: PointerButton;
  readonly buttons: number;       // Bitmask of pressed buttons
  readonly isPrimary: boolean;
}

export interface PointerEventData {
  readonly pointer: PointerState;
  readonly preventDefault: () => void;
  readonly stopPropagation: () => void;
  readonly originalEvent: PointerEvent;
}

export type PointerEventHandler = (data: PointerEventData) => void;

export interface PointerEventHandlers {
  onPointerDown?: PointerEventHandler;
  onPointerMove?: PointerEventHandler;
  onPointerUp?: PointerEventHandler;
  onPointerCancel?: PointerEventHandler;
  onPointerEnter?: PointerEventHandler;
  onPointerLeave?: PointerEventHandler;
}

/**
 * High-performance pointer event manager with multi-touch support.
 * Provides consistent behavior across different browsers and input devices.
 */
export class PointerEventManager {
  private element: HTMLElement;
  private transformContext: TransformContext;
  private handlers: PointerEventHandlers = {};
  private activePointers = new Map<number, PointerState>();
  private isAttached = false;
  
  // Performance monitoring
  private lastEventTime = 0;
  private eventCount = 0;
  
  constructor(element: HTMLElement, transformContext: TransformContext) {
    this.element = element;
    this.transformContext = transformContext;
    
    // Enable touch-action manipulation for better performance
    this.element.style.touchAction = 'none';
  }

  /**
   * Attach pointer event listeners to the target element
   */
  attach(handlers: PointerEventHandlers): void {
    if (this.isAttached) {
      this.detach();
    }
    
    this.handlers = handlers;
    this.isAttached = true;
    
    // Bind event listeners with proper context
    this.element.addEventListener('pointerdown', this.handlePointerDown);
    this.element.addEventListener('pointermove', this.handlePointerMove);
    this.element.addEventListener('pointerup', this.handlePointerUp);
    this.element.addEventListener('pointercancel', this.handlePointerCancel);
    this.element.addEventListener('pointerenter', this.handlePointerEnter);
    this.element.addEventListener('pointerleave', this.handlePointerLeave);
    
    // Prevent default touch behaviors that interfere with drawing
    this.element.addEventListener('touchstart', this.preventDefaultTouch, { passive: false });
    this.element.addEventListener('touchmove', this.preventDefaultTouch, { passive: false });
    this.element.addEventListener('touchend', this.preventDefaultTouch, { passive: false });
  }

  /**
   * Detach all pointer event listeners
   */
  detach(): void {
    if (!this.isAttached) return;
    
    this.element.removeEventListener('pointerdown', this.handlePointerDown);
    this.element.removeEventListener('pointermove', this.handlePointerMove);
    this.element.removeEventListener('pointerup', this.handlePointerUp);
    this.element.removeEventListener('pointercancel', this.handlePointerCancel);
    this.element.removeEventListener('pointerenter', this.handlePointerEnter);
    this.element.removeEventListener('pointerleave', this.handlePointerLeave);
    
    this.element.removeEventListener('touchstart', this.preventDefaultTouch);
    this.element.removeEventListener('touchmove', this.preventDefaultTouch);
    this.element.removeEventListener('touchend', this.preventDefaultTouch);
    
    this.activePointers.clear();
    this.handlers = {};
    this.isAttached = false;
  }

  /**
   * Update the transform context for coordinate conversions
   */
  updateTransformContext(context: TransformContext): void {
    this.transformContext = context;
    
    // Update world positions of active pointers
    const updatedPointers = new Map<number, PointerState>();
    for (const [id, pointer] of this.activePointers) {
      const worldPosition = this.transformContext.createPointFromScreen(pointer.position);
      updatedPointers.set(id, { ...pointer, worldPosition });
    }
    this.activePointers = updatedPointers;
  }

  /**
   * Get current active pointer states
   */
  get activePointerStates(): ReadonlyMap<number, PointerState> {
    return this.activePointers;
  }

  /**
   * Get number of currently active pointers
   */
  get activePointerCount(): number {
    return this.activePointers.size;
  }

  /**
   * Get primary pointer (first touch point or mouse)
   */
  get primaryPointer(): PointerState | null {
    for (const pointer of this.activePointers.values()) {
      if (pointer.isPrimary) {
        return pointer;
      }
    }
    return null;
  }

  /**
   * Get performance statistics for optimization
   */
  getPerformanceStats(): { eventsPerSecond: number; averageLatency: number } {
    const now = performance.now();
    const timeDelta = now - this.lastEventTime;
    const eventsPerSecond = this.eventCount / (timeDelta / 1000);
    
    return {
      eventsPerSecond,
      averageLatency: timeDelta / this.eventCount
    };
  }

  // Event handler implementations (bound to this)
  private handlePointerDown = (event: PointerEvent): void => {
    this.updatePerformanceStats();
    
    const pointerState = this.createPointerState(event);
    this.activePointers.set(event.pointerId, pointerState);
    
    // Set pointer capture for smooth tracking
    this.element.setPointerCapture(event.pointerId);
    
    if (this.handlers.onPointerDown) {
      const eventData = this.createEventData(pointerState, event);
      this.handlers.onPointerDown(eventData);
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.updatePerformanceStats();
    
    const existingPointer = this.activePointers.get(event.pointerId);
    if (!existingPointer) return; // Not tracking this pointer
    
    const pointerState = this.createPointerState(event);
    this.activePointers.set(event.pointerId, pointerState);
    
    if (this.handlers.onPointerMove) {
      const eventData = this.createEventData(pointerState, event);
      this.handlers.onPointerMove(eventData);
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    this.updatePerformanceStats();
    
    const existingPointer = this.activePointers.get(event.pointerId);
    if (!existingPointer) return;
    
    const pointerState = this.createPointerState(event);
    
    if (this.handlers.onPointerUp) {
      const eventData = this.createEventData(pointerState, event);
      this.handlers.onPointerUp(eventData);
    }
    
    // Clean up pointer tracking
    this.activePointers.delete(event.pointerId);
    this.element.releasePointerCapture(event.pointerId);
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    const existingPointer = this.activePointers.get(event.pointerId);
    if (!existingPointer) return;
    
    const pointerState = this.createPointerState(event);
    
    if (this.handlers.onPointerCancel) {
      const eventData = this.createEventData(pointerState, event);
      this.handlers.onPointerCancel(eventData);
    }
    
    // Clean up pointer tracking
    this.activePointers.delete(event.pointerId);
    this.element.releasePointerCapture(event.pointerId);
  };

  private handlePointerEnter = (event: PointerEvent): void => {
    if (!this.handlers.onPointerEnter) return;
    
    const pointerState = this.createPointerState(event);
    const eventData = this.createEventData(pointerState, event);
    this.handlers.onPointerEnter(eventData);
  };

  private handlePointerLeave = (event: PointerEvent): void => {
    if (!this.handlers.onPointerLeave) return;
    
    const pointerState = this.createPointerState(event);
    const eventData = this.createEventData(pointerState, event);
    this.handlers.onPointerLeave(eventData);
  };

  private preventDefaultTouch = (event: TouchEvent): void => {
    // Prevent default touch behaviors that interfere with custom gesture handling
    event.preventDefault();
  };

  /**
   * Create a standardized pointer state from a PointerEvent
   */
  private createPointerState(event: PointerEvent): PointerState {
    const position = new Vec2(event.clientX, event.clientY);
    const worldPosition = this.transformContext.createPointFromScreen(position);
    
    return {
      id: event.pointerId,
      type: this.normalizePointerType(event.pointerType),
      position,
      worldPosition,
      pressure: event.pressure,
      tangentialPressure: event.tangentialPressure || 0,
      tiltX: event.tiltX || 0,
      tiltY: event.tiltY || 0,
      twist: event.twist || 0,
      width: event.width || 1,
      height: event.height || 1,
      timestamp: performance.now(),
      button: event.button as PointerButton,
      buttons: event.buttons,
      isPrimary: event.isPrimary
    };
  }

  /**
   * Create event data wrapper for handlers
   */
  private createEventData(pointer: PointerState, originalEvent: PointerEvent): PointerEventData {
    return {
      pointer,
      preventDefault: () => originalEvent.preventDefault(),
      stopPropagation: () => originalEvent.stopPropagation(),
      originalEvent
    };
  }

  /**
   * Normalize pointer type strings across browsers
   */
  private normalizePointerType(type: string): PointerType {
    switch (type.toLowerCase()) {
      case 'touch': return PointerType.TOUCH;
      case 'mouse': return PointerType.MOUSE;
      case 'pen': return PointerType.PEN;
      default: return PointerType.UNKNOWN;
    }
  }

  /**
   * Update performance tracking statistics
   */
  private updatePerformanceStats(): void {
    const now = performance.now();
    if (this.lastEventTime === 0) {
      this.lastEventTime = now;
    }
    this.eventCount++;
  }
}

/**
 * Utility functions for pointer event analysis
 */
export namespace PointerUtils {
  /**
   * Calculate velocity between two pointer states
   */
  export function calculateVelocity(previous: PointerState, current: PointerState): Vec2 {
    const timeDelta = current.timestamp - previous.timestamp;
    if (timeDelta <= 0) return Vec2.ZERO;
    
    const positionDelta = current.position.subtract(previous.position);
    return positionDelta.divide(timeDelta / 1000); // pixels per second
  }

  /**
   * Calculate distance traveled between two pointer states
   */
  export function calculateDistance(previous: PointerState, current: PointerState): number {
    return previous.position.distanceTo(current.position);
  }

  /**
   * Check if pointer is a stylus/pen with good pressure sensitivity
   */
  export function hasPressureSensitivity(pointer: PointerState): boolean {
    return pointer.type === PointerType.PEN && pointer.pressure > 0 && pointer.pressure < 1;
  }

  /**
   * Check if pointer supports tilt information
   */
  export function hasTiltSupport(pointer: PointerState): boolean {
    return Math.abs(pointer.tiltX) > 0 || Math.abs(pointer.tiltY) > 0;
  }

  /**
   * Calculate the centroid of multiple pointers (useful for multi-touch gestures)
   */
  export function calculateCentroid(pointers: PointerState[]): Vec2 {
    if (pointers.length === 0) return Vec2.ZERO;
    
    let sum = Vec2.ZERO;
    for (const pointer of pointers) {
      sum = sum.add(pointer.position);
    }
    
    return sum.divide(pointers.length);
  }

  /**
   * Calculate average distance from centroid (useful for pinch/zoom gestures)
   */
  export function calculateSpread(pointers: PointerState[]): number {
    if (pointers.length < 2) return 0;
    
    const centroid = calculateCentroid(pointers);
    let totalDistance = 0;
    
    for (const pointer of pointers) {
      totalDistance += pointer.position.distanceTo(centroid);
    }
    
    return totalDistance / pointers.length;
  }
}