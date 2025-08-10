import { Vec2 } from '../core/math/vec2.js';
import { PointerState, PointerEventData, PointerUtils } from './pointer-events.js';

/**
 * Touch state management system for Zotebook's gesture-based CAD interface.
 * Implements the original Zotebook gesture vocabulary:
 * - 1 finger: Draw/select
 * - 2 fingers: Pan and zoom
 * - 3 fingers: Undo
 * 
 * Based on the original iOS touch handling but enhanced for web platform capabilities.
 */

export enum TouchMode {
  IDLE = 'idle',           // No active touches
  DRAWING = 'drawing',     // Single finger drawing/selection
  PAN_ZOOM = 'pan_zoom',   // Two finger pan/zoom manipulation
  UNDO = 'undo',          // Three finger undo gesture
  MULTI_TOUCH = 'multi_touch' // More complex multi-touch scenarios
}

export enum GestureState {
  NONE = 'none',
  POSSIBLE = 'possible',   // Gesture could be starting
  BEGAN = 'began',         // Gesture definitively started
  CHANGED = 'changed',     // Gesture is updating
  ENDED = 'ended',         // Gesture completed successfully
  CANCELLED = 'cancelled', // Gesture was interrupted/cancelled
  FAILED = 'failed'        // Gesture didn't meet criteria
}

export interface TouchGesture {
  readonly type: TouchMode;
  readonly state: GestureState;
  readonly startTime: number;
  readonly duration: number;
  readonly pointerCount: number;
  readonly primaryPointer: PointerState | null;
  readonly centroid: Vec2;
  readonly data: any; // Gesture-specific data
}

export interface DrawingGesture extends TouchGesture {
  readonly type: TouchMode.DRAWING;
  readonly data: {
    startPosition: Vec2;
    currentPosition: Vec2;
    totalDistance: number;
    velocity: Vec2;
    strokePoints: Vec2[];
  };
}

export interface PanZoomGesture extends TouchGesture {
  readonly type: TouchMode.PAN_ZOOM;
  readonly data: {
    initialCentroid: Vec2;
    initialSpread: number;
    currentCentroid: Vec2;
    currentSpread: number;
    panDelta: Vec2;
    zoomFactor: number;
    rotation: number;
  };
}

export interface UndoGesture extends TouchGesture {
  readonly type: TouchMode.UNDO;
  readonly data: {
    triggerPosition: Vec2;
    confirmationTime: number;
  };
}

export type AnyTouchGesture = DrawingGesture | PanZoomGesture | UndoGesture | TouchGesture;

export interface TouchStateEventHandlers {
  onTouchModeChanged?: (previousMode: TouchMode, currentMode: TouchMode) => void;
  onGestureStarted?: (gesture: AnyTouchGesture) => void;
  onGestureUpdated?: (gesture: AnyTouchGesture) => void;
  onGestureEnded?: (gesture: AnyTouchGesture) => void;
  onGestureCancelled?: (gesture: AnyTouchGesture) => void;
}

/**
 * Manages touch state transitions and gesture recognition for Zotebook's interface.
 * Implements a clean state machine for handling multi-touch scenarios.
 */
export class TouchStateManager {
  private currentMode = TouchMode.IDLE;
  private currentGesture: AnyTouchGesture | null = null;
  private activePointers = new Map<number, PointerState>();
  private gestureHistory: AnyTouchGesture[] = [];
  private handlers: TouchStateEventHandlers = {};
  
  // Gesture detection parameters
  private readonly MOVEMENT_THRESHOLD = 5; // pixels
  private readonly UNDO_HOLD_TIME = 500; // milliseconds
  private readonly MAX_GESTURE_HISTORY = 50;
  
  // Performance tracking
  private lastUpdateTime = 0;
  
  constructor(handlers?: TouchStateEventHandlers) {
    if (handlers) {
      this.handlers = handlers;
    }
  }

  /**
   * Update handlers for touch state events
   */
  setHandlers(handlers: TouchStateEventHandlers): void {
    this.handlers = handlers;
  }

  /**
   * Process a pointer down event and update touch state
   */
  handlePointerDown(event: PointerEventData): void {
    const { pointer } = event;
    this.activePointers.set(pointer.id, pointer);
    this.lastUpdateTime = pointer.timestamp;
    
    const newMode = this.determineTouchMode();
    if (newMode !== this.currentMode) {
      this.transitionToMode(newMode, pointer);
    } else {
      this.updateCurrentGesture(pointer);
    }
  }

  /**
   * Process a pointer move event and update touch state
   */
  handlePointerMove(event: PointerEventData): void {
    const { pointer } = event;
    
    // Update pointer state
    const existingPointer = this.activePointers.get(pointer.id);
    if (!existingPointer) return; // Not tracking this pointer
    
    this.activePointers.set(pointer.id, pointer);
    this.lastUpdateTime = pointer.timestamp;
    
    // Update current gesture
    this.updateCurrentGesture(pointer);
  }

  /**
   * Process a pointer up event and update touch state
   */
  handlePointerUp(event: PointerEventData): void {
    const { pointer } = event;
    
    // Remove from active pointers
    this.activePointers.delete(pointer.id);
    this.lastUpdateTime = pointer.timestamp;
    
    // Determine if gesture should end or continue
    const newMode = this.determineTouchMode();
    if (newMode !== this.currentMode) {
      this.endCurrentGesture();
      this.transitionToMode(newMode, pointer);
    } else {
      this.updateCurrentGesture(pointer);
    }
  }

  /**
   * Process a pointer cancel event and update touch state
   */
  handlePointerCancel(event: PointerEventData): void {
    const { pointer } = event;
    
    this.activePointers.delete(pointer.id);
    this.cancelCurrentGesture();
    
    const newMode = this.determineTouchMode();
    this.transitionToMode(newMode, pointer);
  }

  /**
   * Get current touch mode
   */
  get touchMode(): TouchMode {
    return this.currentMode;
  }

  /**
   * Get current active gesture
   */
  get activeGesture(): AnyTouchGesture | null {
    return this.currentGesture;
  }

  /**
   * Get number of active touch points
   */
  get activePointerCount(): number {
    return this.activePointers.size;
  }

  /**
   * Get recent gesture history for context-aware recognition
   */
  get recentGestures(): ReadonlyArray<AnyTouchGesture> {
    return this.gestureHistory.slice();
  }

  /**
   * Force reset to idle state (useful for error recovery)
   */
  reset(): void {
    this.endCurrentGesture();
    this.activePointers.clear();
    this.currentMode = TouchMode.IDLE;
    this.currentGesture = null;
  }

  /**
   * Determine appropriate touch mode based on active pointers
   */
  private determineTouchMode(): TouchMode {
    const count = this.activePointers.size;
    
    switch (count) {
      case 0: return TouchMode.IDLE;
      case 1: return TouchMode.DRAWING;
      case 2: return TouchMode.PAN_ZOOM;
      case 3: return TouchMode.UNDO;
      default: return TouchMode.MULTI_TOUCH;
    }
  }

  /**
   * Transition from current mode to new mode
   */
  private transitionToMode(newMode: TouchMode, triggerPointer: PointerState): void {
    const previousMode = this.currentMode;
    
    // End current gesture if transitioning
    if (this.currentGesture && newMode !== previousMode) {
      this.endCurrentGesture();
    }
    
    // Update mode
    this.currentMode = newMode;
    
    // Start new gesture if not idle
    if (newMode !== TouchMode.IDLE) {
      this.startGesture(newMode, triggerPointer);
    }
    
    // Notify mode change
    if (this.handlers.onTouchModeChanged) {
      this.handlers.onTouchModeChanged(previousMode, newMode);
    }
  }

  /**
   * Start a new gesture based on touch mode
   */
  private startGesture(mode: TouchMode, triggerPointer: PointerState): void {
    const baseGesture = {
      type: mode,
      state: GestureState.BEGAN,
      startTime: triggerPointer.timestamp,
      duration: 0,
      pointerCount: this.activePointers.size,
      primaryPointer: this.getPrimaryPointer(),
      centroid: this.calculateCentroid()
    };

    switch (mode) {
      case TouchMode.DRAWING:
        this.currentGesture = this.createDrawingGesture(baseGesture, triggerPointer);
        break;
      case TouchMode.PAN_ZOOM:
        this.currentGesture = this.createPanZoomGesture(baseGesture);
        break;
      case TouchMode.UNDO:
        this.currentGesture = this.createUndoGesture(baseGesture, triggerPointer);
        break;
      default:
        this.currentGesture = {
          ...baseGesture,
          data: {}
        } as TouchGesture;
    }

    if (this.handlers.onGestureStarted) {
      this.handlers.onGestureStarted(this.currentGesture);
    }
  }

  /**
   * Update the current gesture with new pointer data
   */
  private updateCurrentGesture(updatedPointer: PointerState): void {
    if (!this.currentGesture) return;
    
    const now = updatedPointer.timestamp;
    const duration = now - this.currentGesture.startTime;
    const centroid = this.calculateCentroid();
    
    // Update base gesture properties
    let updatedGesture: AnyTouchGesture = {
      ...this.currentGesture,
      state: GestureState.CHANGED,
      duration,
      pointerCount: this.activePointers.size,
      primaryPointer: this.getPrimaryPointer(),
      centroid
    };

    // Update gesture-specific data
    switch (this.currentGesture.type) {
      case TouchMode.DRAWING:
        updatedGesture = this.updateDrawingGesture(updatedGesture as DrawingGesture, updatedPointer);
        break;
      case TouchMode.PAN_ZOOM:
        updatedGesture = this.updatePanZoomGesture(updatedGesture as PanZoomGesture);
        break;
      case TouchMode.UNDO:
        updatedGesture = this.updateUndoGesture(updatedGesture as UndoGesture, now);
        break;
    }

    this.currentGesture = updatedGesture;

    if (this.handlers.onGestureUpdated) {
      this.handlers.onGestureUpdated(this.currentGesture);
    }
  }

  /**
   * End the current gesture successfully
   */
  private endCurrentGesture(): void {
    if (!this.currentGesture) return;
    
    const endedGesture: AnyTouchGesture = {
      ...this.currentGesture,
      state: GestureState.ENDED,
      duration: this.lastUpdateTime - this.currentGesture.startTime
    };

    // Add to history
    this.addToHistory(endedGesture);
    
    if (this.handlers.onGestureEnded) {
      this.handlers.onGestureEnded(endedGesture);
    }

    this.currentGesture = null;
  }

  /**
   * Cancel the current gesture
   */
  private cancelCurrentGesture(): void {
    if (!this.currentGesture) return;
    
    const cancelledGesture: AnyTouchGesture = {
      ...this.currentGesture,
      state: GestureState.CANCELLED,
      duration: this.lastUpdateTime - this.currentGesture.startTime
    };

    if (this.handlers.onGestureCancelled) {
      this.handlers.onGestureCancelled(cancelledGesture);
    }

    this.currentGesture = null;
  }

  /**
   * Create a drawing gesture
   */
  private createDrawingGesture(base: Omit<TouchGesture, 'data'>, pointer: PointerState): DrawingGesture {
    return {
      ...base,
      type: TouchMode.DRAWING,
      data: {
        startPosition: pointer.position,
        currentPosition: pointer.position,
        totalDistance: 0,
        velocity: Vec2.ZERO,
        strokePoints: [pointer.position]
      }
    };
  }

  /**
   * Update drawing gesture with new pointer data
   */
  private updateDrawingGesture(gesture: DrawingGesture, pointer: PointerState): DrawingGesture {
    const previousPosition = gesture.data.currentPosition;
    const distance = previousPosition.distanceTo(pointer.position);
    const totalDistance = gesture.data.totalDistance + distance;
    
    // Calculate velocity (only if we have a time difference)
    let velocity = gesture.data.velocity;
    if (gesture.duration > 0) {
      const timeDelta = (pointer.timestamp - gesture.startTime) / 1000; // seconds
      const displacement = pointer.position.subtract(gesture.data.startPosition);
      velocity = displacement.divide(timeDelta);
    }

    const newStrokePoints = [...gesture.data.strokePoints];
    
    // Add point if significant movement occurred
    if (distance > 1) { // 1 pixel threshold
      newStrokePoints.push(pointer.position);
    }

    return {
      ...gesture,
      data: {
        ...gesture.data,
        currentPosition: pointer.position,
        totalDistance,
        velocity,
        strokePoints: newStrokePoints
      }
    };
  }

  /**
   * Create a pan/zoom gesture
   */
  private createPanZoomGesture(base: Omit<TouchGesture, 'data'>): PanZoomGesture {
    const pointers = Array.from(this.activePointers.values());
    const centroid = PointerUtils.calculateCentroid(pointers);
    const spread = PointerUtils.calculateSpread(pointers);
    
    return {
      ...base,
      type: TouchMode.PAN_ZOOM,
      data: {
        initialCentroid: centroid,
        initialSpread: spread,
        currentCentroid: centroid,
        currentSpread: spread,
        panDelta: Vec2.ZERO,
        zoomFactor: 1.0,
        rotation: 0
      }
    };
  }

  /**
   * Update pan/zoom gesture
   */
  private updatePanZoomGesture(gesture: PanZoomGesture): PanZoomGesture {
    const pointers = Array.from(this.activePointers.values());
    const currentCentroid = PointerUtils.calculateCentroid(pointers);
    const currentSpread = PointerUtils.calculateSpread(pointers);
    
    const panDelta = currentCentroid.subtract(gesture.data.initialCentroid);
    const zoomFactor = gesture.data.initialSpread > 0 ? currentSpread / gesture.data.initialSpread : 1.0;
    
    // Calculate rotation for two-pointer gestures
    let rotation = 0;
    if (pointers.length === 2) {
      const initialVector = pointers[1].position.subtract(pointers[0].position);
      // We'd need to store initial vector to calculate rotation properly
      // For now, set to 0 - can be enhanced later
    }

    return {
      ...gesture,
      data: {
        ...gesture.data,
        currentCentroid,
        currentSpread,
        panDelta,
        zoomFactor,
        rotation
      }
    };
  }

  /**
   * Create an undo gesture
   */
  private createUndoGesture(base: Omit<TouchGesture, 'data'>, pointer: PointerState): UndoGesture {
    return {
      ...base,
      type: TouchMode.UNDO,
      data: {
        triggerPosition: pointer.position,
        confirmationTime: pointer.timestamp + this.UNDO_HOLD_TIME
      }
    };
  }

  /**
   * Update undo gesture
   */
  private updateUndoGesture(gesture: UndoGesture, currentTime: number): UndoGesture {
    return {
      ...gesture,
      data: {
        ...gesture.data,
        // Undo gesture data doesn't change during update
      }
    };
  }

  /**
   * Get the primary pointer (first active pointer or mouse)
   */
  private getPrimaryPointer(): PointerState | null {
    for (const pointer of this.activePointers.values()) {
      if (pointer.isPrimary) {
        return pointer;
      }
    }
    return this.activePointers.size > 0 ? Array.from(this.activePointers.values())[0] : null;
  }

  /**
   * Calculate centroid of all active pointers
   */
  private calculateCentroid(): Vec2 {
    const pointers = Array.from(this.activePointers.values());
    return PointerUtils.calculateCentroid(pointers);
  }

  /**
   * Add gesture to history with size management
   */
  private addToHistory(gesture: AnyTouchGesture): void {
    this.gestureHistory.push(gesture);
    
    // Maintain history size limit
    if (this.gestureHistory.length > this.MAX_GESTURE_HISTORY) {
      this.gestureHistory.shift();
    }
  }
}

/**
 * Utility functions for touch state analysis
 */
export namespace TouchStateUtils {
  /**
   * Check if a gesture is a quick tap (for UI interaction detection)
   */
  export function isQuickTap(gesture: AnyTouchGesture): boolean {
    if (gesture.type !== TouchMode.DRAWING) return false;
    
    const drawingGesture = gesture as DrawingGesture;
    return gesture.duration < 200 && // Less than 200ms
           drawingGesture.data.totalDistance < 10; // Less than 10 pixels movement
  }

  /**
   * Check if a gesture represents intentional drawing (vs accidental touch)
   */
  export function isIntentionalDrawing(gesture: DrawingGesture): boolean {
    return gesture.duration > 100 || // Held for at least 100ms
           gesture.data.totalDistance > 20; // Or moved more than 20 pixels
  }

  /**
   * Check if pan/zoom gesture is primarily panning
   */
  export function isPanningGesture(gesture: PanZoomGesture): boolean {
    const panDistance = gesture.data.panDelta.length;
    const zoomChange = Math.abs(gesture.data.zoomFactor - 1.0);
    
    return panDistance > 20 && zoomChange < 0.1; // Significant pan, minimal zoom
  }

  /**
   * Check if pan/zoom gesture is primarily zooming
   */
  export function isZoomingGesture(gesture: PanZoomGesture): boolean {
    const panDistance = gesture.data.panDelta.length;
    const zoomChange = Math.abs(gesture.data.zoomFactor - 1.0);
    
    return zoomChange > 0.1 && panDistance < 20; // Significant zoom, minimal pan
  }

  /**
   * Check if undo gesture should trigger (held long enough)
   */
  export function shouldTriggerUndo(gesture: UndoGesture, currentTime: number): boolean {
    return currentTime >= gesture.data.confirmationTime;
  }
}