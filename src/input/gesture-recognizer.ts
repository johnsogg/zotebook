import { Vec2 } from '../core/math/vec2.js';
import { PointerState, PointerUtils } from './pointer-events.js';
import { TouchMode, PanZoomGesture, UndoGesture } from './touch-state.js';

/**
 * Multi-touch gesture recognition system for Zotebook.
 * Recognizes pan, zoom, rotation, and undo gestures from multi-touch input.
 * Implements sophisticated gesture analysis from the original Zotebook interface.
 */

export enum GestureType {
  PAN = 'pan',
  ZOOM = 'zoom',
  ROTATE = 'rotate',
  UNDO = 'undo',
  TAP = 'tap',
  LONG_PRESS = 'long_press',
  SWIPE = 'swipe'
}

export enum GesturePhase {
  POSSIBLE = 'possible',
  BEGAN = 'began',
  CHANGED = 'changed',
  ENDED = 'ended',
  CANCELLED = 'cancelled',
  FAILED = 'failed'
}

export interface RecognizedGesture {
  readonly type: GestureType;
  readonly phase: GesturePhase;
  readonly timestamp: number;
  readonly duration: number;
  readonly pointers: ReadonlyArray<PointerState>;
  readonly centroid: Vec2;
  readonly confidence: number; // 0.0-1.0
  readonly data: GestureData;
}

export interface GestureData {
  readonly pan?: {
    translation: Vec2;
    velocity: Vec2;
    totalDistance: number;
  };
  readonly zoom?: {
    scale: number;
    velocity: number;
    center: Vec2;
  };
  readonly rotation?: {
    angle: number;
    velocity: number;
    center: Vec2;
  };
  readonly tap?: {
    position: Vec2;
    tapCount: number;
  };
  readonly swipe?: {
    direction: Vec2;
    velocity: number;
    distance: number;
  };
  readonly undo?: {
    holdDuration: number;
    confirmationProgress: number; // 0.0-1.0
  };
}

export interface GestureRecognitionOptions {
  readonly panThreshold: number;         // Minimum movement for pan (pixels)
  readonly zoomThreshold: number;        // Minimum scale change for zoom
  readonly rotationThreshold: number;    // Minimum rotation for rotation gesture (radians)
  readonly tapTimeout: number;           // Maximum time for tap gesture (ms)
  readonly tapRadius: number;            // Maximum movement for tap (pixels)
  readonly longPressTimeout: number;     // Time required for long press (ms)
  readonly undoHoldTime: number;         // Time required for undo confirmation (ms)
  readonly swipeMinVelocity: number;     // Minimum velocity for swipe (pixels/s)
  readonly swipeMinDistance: number;     // Minimum distance for swipe (pixels)
  readonly simultaneousRecognition: boolean; // Allow multiple gestures simultaneously
}

const DEFAULT_GESTURE_OPTIONS: GestureRecognitionOptions = {
  panThreshold: 10,
  zoomThreshold: 0.1,
  rotationThreshold: Math.PI / 18, // 10 degrees
  tapTimeout: 300,
  tapRadius: 20,
  longPressTimeout: 500,
  undoHoldTime: 800,
  swipeMinVelocity: 100,
  swipeMinDistance: 50,
  simultaneousRecognition: true
};

/**
 * Sophisticated multi-touch gesture recognizer with state tracking.
 */
export class GestureRecognizer {
  private options: GestureRecognitionOptions;
  private activeGestures = new Map<GestureType, RecognizedGesture>();
  private gestureHistory: RecognizedGesture[] = [];
  
  // State tracking for various gestures
  private panState: {
    initialCentroid?: Vec2;
    lastCentroid?: Vec2;
    totalTranslation?: Vec2;
    velocity?: Vec2;
    startTime?: number;
  } = {};
  
  private zoomState: {
    initialSpread?: number;
    lastSpread?: number;
    scale?: number;
    velocity?: number;
    startTime?: number;
  } = {};
  
  private rotationState: {
    initialAngle?: number;
    lastAngle?: number;
    totalRotation?: number;
    velocity?: number;
    startTime?: number;
  } = {};
  
  private tapState: {
    startTime?: number;
    startPosition?: Vec2;
    tapCount?: number;
    lastTapTime?: number;
  } = {};
  
  private undoState: {
    startTime?: number;
    requiredHoldTime?: number;
    isConfirmed?: boolean;
  } = {};

  constructor(options: Partial<GestureRecognitionOptions> = {}) {
    this.options = { ...DEFAULT_GESTURE_OPTIONS, ...options };
  }

  /**
   * Process pointer input and update gesture recognition
   */
  recognizeGestures(pointers: ReadonlyArray<PointerState>, touchMode: TouchMode): RecognizedGesture[] {
    const currentTime = performance.now();
    const recognizedGestures: RecognizedGesture[] = [];
    
    // Clear finished gestures from active set
    this.cleanupFinishedGestures();
    
    switch (touchMode) {
      case TouchMode.DRAWING:
        // Single finger gestures
        if (pointers.length === 1) {
          const tapGesture = this.recognizeTap(pointers, currentTime);
          if (tapGesture) recognizedGestures.push(tapGesture);
          
          const longPressGesture = this.recognizeLongPress(pointers, currentTime);
          if (longPressGesture) recognizedGestures.push(longPressGesture);
          
          const swipeGesture = this.recognizeSwipe(pointers, currentTime);
          if (swipeGesture) recognizedGestures.push(swipeGesture);
        }
        break;
        
      case TouchMode.PAN_ZOOM:
        // Two finger gestures
        if (pointers.length === 2) {
          const panGesture = this.recognizePan(pointers, currentTime);
          if (panGesture) recognizedGestures.push(panGesture);
          
          const zoomGesture = this.recognizeZoom(pointers, currentTime);
          if (zoomGesture) recognizedGestures.push(zoomGesture);
          
          const rotationGesture = this.recognizeRotation(pointers, currentTime);
          if (rotationGesture) recognizedGestures.push(rotationGesture);
        }
        break;
        
      case TouchMode.UNDO:
        // Three finger undo gesture
        if (pointers.length >= 3) {
          const undoGesture = this.recognizeUndo(pointers, currentTime);
          if (undoGesture) recognizedGestures.push(undoGesture);
        }
        break;
    }
    
    // Update active gestures and add to history
    for (const gesture of recognizedGestures) {
      this.activeGestures.set(gesture.type, gesture);
      
      if (gesture.phase === GesturePhase.ENDED || gesture.phase === GesturePhase.CANCELLED) {
        this.addToHistory(gesture);
      }
    }
    
    return recognizedGestures;
  }

  /**
   * Get currently active gestures
   */
  getActiveGestures(): ReadonlyMap<GestureType, RecognizedGesture> {
    return new Map(this.activeGestures);
  }

  /**
   * Get recent gesture history
   */
  getGestureHistory(maxAge: number = 5000): ReadonlyArray<RecognizedGesture> {
    const cutoffTime = performance.now() - maxAge;
    return this.gestureHistory.filter(g => g.timestamp >= cutoffTime);
  }

  /**
   * Reset all gesture state
   */
  reset(): void {
    this.activeGestures.clear();
    this.panState = {};
    this.zoomState = {};
    this.rotationState = {};
    this.tapState = {};
    this.undoState = {};
  }

  /**
   * Recognize tap gesture
   */
  private recognizeTap(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 1) return null;
    
    const pointer = pointers[0];
    
    if (!this.tapState.startTime) {
      // Start tracking tap
      this.tapState.startTime = currentTime;
      this.tapState.startPosition = pointer.position;
      return null;
    }
    
    const duration = currentTime - this.tapState.startTime;
    const movement = pointer.position.distanceTo(this.tapState.startPosition!);
    
    // Check if tap conditions are met
    if (duration <= this.options.tapTimeout && movement <= this.options.tapRadius) {
      // Successful tap
      const tapCount = this.calculateTapCount(currentTime);
      
      const gesture: RecognizedGesture = {
        type: GestureType.TAP,
        phase: GesturePhase.ENDED,
        timestamp: currentTime,
        duration,
        pointers,
        centroid: pointer.position,
        confidence: 1.0 - (movement / this.options.tapRadius) * 0.3,
        data: {
          tap: {
            position: pointer.position,
            tapCount
          }
        }
      };
      
      this.tapState.lastTapTime = currentTime;
      this.tapState.tapCount = tapCount;
      this.tapState.startTime = undefined;
      
      return gesture;
    } else if (duration > this.options.tapTimeout || movement > this.options.tapRadius) {
      // Tap failed
      this.tapState.startTime = undefined;
      return null;
    }
    
    return null; // Still in progress
  }

  /**
   * Recognize long press gesture
   */
  private recognizeLongPress(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 1) return null;
    
    const pointer = pointers[0];
    
    if (!this.tapState.startTime || !this.tapState.startPosition) return null;
    
    const duration = currentTime - this.tapState.startTime;
    const movement = pointer.position.distanceTo(this.tapState.startPosition);
    
    if (duration >= this.options.longPressTimeout && movement <= this.options.tapRadius) {
      const gesture: RecognizedGesture = {
        type: GestureType.LONG_PRESS,
        phase: GesturePhase.BEGAN,
        timestamp: currentTime,
        duration,
        pointers,
        centroid: pointer.position,
        confidence: 1.0 - (movement / this.options.tapRadius) * 0.2,
        data: {}
      };
      
      this.tapState.startTime = undefined; // Clear tap state since long press took precedence
      
      return gesture;
    }
    
    return null;
  }

  /**
   * Recognize swipe gesture
   */
  private recognizeSwipe(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 1) return null;
    
    const pointer = pointers[0];
    
    if (!this.tapState.startTime || !this.tapState.startPosition) return null;
    
    const duration = currentTime - this.tapState.startTime;
    const displacement = pointer.position.subtract(this.tapState.startPosition);
    const distance = displacement.length;
    const velocity = duration > 0 ? (distance / duration) * 1000 : 0; // pixels per second
    
    if (velocity >= this.options.swipeMinVelocity && distance >= this.options.swipeMinDistance) {
      const direction = displacement.normalized;
      
      const gesture: RecognizedGesture = {
        type: GestureType.SWIPE,
        phase: GesturePhase.ENDED,
        timestamp: currentTime,
        duration,
        pointers,
        centroid: pointer.position,
        confidence: Math.min(1.0, velocity / (this.options.swipeMinVelocity * 3)),
        data: {
          swipe: {
            direction,
            velocity,
            distance
          }
        }
      };
      
      this.tapState.startTime = undefined;
      
      return gesture;
    }
    
    return null;
  }

  /**
   * Recognize pan gesture
   */
  private recognizePan(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 2) return null;
    
    const centroid = PointerUtils.calculateCentroid(pointers);
    
    if (!this.panState.initialCentroid) {
      // Initialize pan tracking
      this.panState.initialCentroid = centroid;
      this.panState.lastCentroid = centroid;
      this.panState.totalTranslation = Vec2.ZERO;
      this.panState.velocity = Vec2.ZERO;
      this.panState.startTime = currentTime;
      return null;
    }
    
    const translation = centroid.subtract(this.panState.initialCentroid);
    const instantTranslation = centroid.subtract(this.panState.lastCentroid!);
    const duration = currentTime - this.panState.startTime!;
    
    // Calculate velocity
    const timeDelta = 16; // Assume ~60fps updates
    const velocity = instantTranslation.multiply(1000 / timeDelta); // pixels per second
    
    this.panState.lastCentroid = centroid;
    this.panState.totalTranslation = translation;
    this.panState.velocity = velocity;
    
    if (translation.length >= this.options.panThreshold) {
      const phase = this.getGesturePhase(GestureType.PAN, translation.length > this.options.panThreshold);
      
      const gesture: RecognizedGesture = {
        type: GestureType.PAN,
        phase,
        timestamp: currentTime,
        duration,
        pointers,
        centroid,
        confidence: Math.min(1.0, translation.length / (this.options.panThreshold * 2)),
        data: {
          pan: {
            translation,
            velocity,
            totalDistance: translation.length
          }
        }
      };
      
      return gesture;
    }
    
    return null;
  }

  /**
   * Recognize zoom gesture
   */
  private recognizeZoom(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 2) return null;
    
    const currentSpread = PointerUtils.calculateSpread(pointers);
    const centroid = PointerUtils.calculateCentroid(pointers);
    
    if (!this.zoomState.initialSpread) {
      // Initialize zoom tracking
      this.zoomState.initialSpread = currentSpread;
      this.zoomState.lastSpread = currentSpread;
      this.zoomState.scale = 1.0;
      this.zoomState.velocity = 0;
      this.zoomState.startTime = currentTime;
      return null;
    }
    
    const scale = this.zoomState.initialSpread! > 0 ? currentSpread / this.zoomState.initialSpread! : 1.0;
    const scaleChange = Math.abs(scale - 1.0);
    
    // Calculate zoom velocity
    const timeDelta = 16;
    const spreadDelta = currentSpread - this.zoomState.lastSpread!;
    const velocity = (spreadDelta / timeDelta) * 1000;
    
    this.zoomState.lastSpread = currentSpread;
    this.zoomState.scale = scale;
    this.zoomState.velocity = velocity;
    
    if (scaleChange >= this.options.zoomThreshold) {
      const duration = currentTime - this.zoomState.startTime!;
      const phase = this.getGesturePhase(GestureType.ZOOM, scaleChange > this.options.zoomThreshold);
      
      const gesture: RecognizedGesture = {
        type: GestureType.ZOOM,
        phase,
        timestamp: currentTime,
        duration,
        pointers,
        centroid,
        confidence: Math.min(1.0, scaleChange / (this.options.zoomThreshold * 2)),
        data: {
          zoom: {
            scale,
            velocity,
            center: centroid
          }
        }
      };
      
      return gesture;
    }
    
    return null;
  }

  /**
   * Recognize rotation gesture
   */
  private recognizeRotation(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length !== 2) return null;
    
    const p1 = pointers[0].position;
    const p2 = pointers[1].position;
    const vector = p2.subtract(p1);
    const currentAngle = Math.atan2(vector.y, vector.x);
    const centroid = p1.add(p2).multiply(0.5);
    
    if (this.rotationState.initialAngle === undefined) {
      // Initialize rotation tracking
      this.rotationState.initialAngle = currentAngle;
      this.rotationState.lastAngle = currentAngle;
      this.rotationState.totalRotation = 0;
      this.rotationState.velocity = 0;
      this.rotationState.startTime = currentTime;
      return null;
    }
    
    // Calculate rotation angle (handle angle wrapping)
    let angleDelta = currentAngle - this.rotationState.lastAngle!;
    if (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;
    if (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;
    
    const totalRotation = this.rotationState.totalRotation! + angleDelta;
    
    // Calculate rotation velocity
    const timeDelta = 16;
    const velocity = (angleDelta / timeDelta) * 1000; // radians per second
    
    this.rotationState.lastAngle = currentAngle;
    this.rotationState.totalRotation = totalRotation;
    this.rotationState.velocity = velocity;
    
    if (Math.abs(totalRotation) >= this.options.rotationThreshold) {
      const duration = currentTime - this.rotationState.startTime!;
      const phase = this.getGesturePhase(GestureType.ROTATE, Math.abs(totalRotation) > this.options.rotationThreshold);
      
      const gesture: RecognizedGesture = {
        type: GestureType.ROTATE,
        phase,
        timestamp: currentTime,
        duration,
        pointers,
        centroid,
        confidence: Math.min(1.0, Math.abs(totalRotation) / (this.options.rotationThreshold * 2)),
        data: {
          rotation: {
            angle: totalRotation,
            velocity,
            center: centroid
          }
        }
      };
      
      return gesture;
    }
    
    return null;
  }

  /**
   * Recognize undo gesture (three finger hold)
   */
  private recognizeUndo(pointers: ReadonlyArray<PointerState>, currentTime: number): RecognizedGesture | null {
    if (pointers.length < 3) return null;
    
    const centroid = PointerUtils.calculateCentroid(pointers);
    
    if (!this.undoState.startTime) {
      // Initialize undo tracking
      this.undoState.startTime = currentTime;
      this.undoState.requiredHoldTime = this.options.undoHoldTime;
      this.undoState.isConfirmed = false;
      return null;
    }
    
    const holdDuration = currentTime - this.undoState.startTime;
    const confirmationProgress = Math.min(1.0, holdDuration / this.undoState.requiredHoldTime!);
    
    let phase = GesturePhase.BEGAN;
    if (holdDuration >= this.undoState.requiredHoldTime!) {
      phase = this.undoState.isConfirmed ? GesturePhase.ENDED : GesturePhase.CHANGED;
      this.undoState.isConfirmed = true;
    }
    
    const gesture: RecognizedGesture = {
      type: GestureType.UNDO,
      phase,
      timestamp: currentTime,
      duration: holdDuration,
      pointers,
      centroid,
      confidence: confirmationProgress,
      data: {
        undo: {
          holdDuration,
          confirmationProgress
        }
      }
    };
    
    return gesture;
  }

  /**
   * Calculate tap count for multi-tap recognition
   */
  private calculateTapCount(currentTime: number): number {
    const maxMultiTapInterval = 400; // ms
    
    if (!this.tapState.lastTapTime || !this.tapState.tapCount) {
      return 1;
    }
    
    const timeSinceLastTap = currentTime - this.tapState.lastTapTime;
    
    if (timeSinceLastTap <= maxMultiTapInterval) {
      return this.tapState.tapCount + 1;
    } else {
      return 1;
    }
  }

  /**
   * Get appropriate gesture phase
   */
  private getGesturePhase(gestureType: GestureType, isActive: boolean): GesturePhase {
    const existingGesture = this.activeGestures.get(gestureType);
    
    if (!existingGesture) {
      return isActive ? GesturePhase.BEGAN : GesturePhase.POSSIBLE;
    }
    
    if (isActive) {
      return existingGesture.phase === GesturePhase.BEGAN || existingGesture.phase === GesturePhase.CHANGED
        ? GesturePhase.CHANGED
        : GesturePhase.BEGAN;
    } else {
      return GesturePhase.ENDED;
    }
  }

  /**
   * Clean up gestures that have finished
   */
  private cleanupFinishedGestures(): void {
    for (const [type, gesture] of this.activeGestures) {
      if (gesture.phase === GesturePhase.ENDED || gesture.phase === GesturePhase.CANCELLED) {
        this.activeGestures.delete(type);
      }
    }
  }

  /**
   * Add gesture to history
   */
  private addToHistory(gesture: RecognizedGesture): void {
    this.gestureHistory.push(gesture);
    
    // Limit history size
    const maxHistorySize = 100;
    if (this.gestureHistory.length > maxHistorySize) {
      this.gestureHistory.shift();
    }
  }

  /**
   * Update recognition options
   */
  updateOptions(newOptions: Partial<GestureRecognitionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}

/**
 * Utility functions for gesture analysis and debugging
 */
export namespace GestureUtils {
  /**
   * Calculate gesture similarity for pattern recognition
   */
  export function calculateGestureSimilarity(gesture1: RecognizedGesture, gesture2: RecognizedGesture): number {
    if (gesture1.type !== gesture2.type) return 0;
    
    // Compare timing
    const timingSimilarity = 1 - Math.abs(gesture1.duration - gesture2.duration) / Math.max(gesture1.duration, gesture2.duration);
    
    // Compare spatial properties
    let spatialSimilarity = 1;
    
    if (gesture1.data.pan && gesture2.data.pan) {
      const distance1 = gesture1.data.pan.totalDistance;
      const distance2 = gesture2.data.pan.totalDistance;
      spatialSimilarity = 1 - Math.abs(distance1 - distance2) / Math.max(distance1, distance2);
    }
    
    if (gesture1.data.zoom && gesture2.data.zoom) {
      const scale1 = gesture1.data.zoom.scale;
      const scale2 = gesture2.data.zoom.scale;
      spatialSimilarity = 1 - Math.abs(scale1 - scale2) / Math.max(Math.abs(scale1 - 1), Math.abs(scale2 - 1));
    }
    
    return (timingSimilarity + spatialSimilarity) / 2;
  }

  /**
   * Check if gesture is intentional (vs accidental touch)
   */
  export function isIntentionalGesture(gesture: RecognizedGesture): boolean {
    // Gestures with high confidence are likely intentional
    if (gesture.confidence > 0.8) return true;
    
    // Long duration gestures are likely intentional
    if (gesture.duration > 300) return true;
    
    // Large movements are likely intentional
    if (gesture.data.pan?.totalDistance && gesture.data.pan.totalDistance > 50) return true;
    if (gesture.data.zoom?.scale && Math.abs(gesture.data.zoom.scale - 1) > 0.2) return true;
    
    return false;
  }

  /**
   * Format gesture for debugging display
   */
  export function formatGestureForDebug(gesture: RecognizedGesture): string {
    let info = `${gesture.type.toUpperCase()} [${gesture.phase}] (${gesture.confidence.toFixed(2)})`;
    
    if (gesture.data.pan) {
      info += ` Pan: ${gesture.data.pan.translation.length.toFixed(1)}px`;
    }
    
    if (gesture.data.zoom) {
      info += ` Zoom: ${gesture.data.zoom.scale.toFixed(2)}x`;
    }
    
    if (gesture.data.rotation) {
      const degrees = (gesture.data.rotation.angle * 180 / Math.PI).toFixed(1);
      info += ` Rotation: ${degrees}°`;
    }
    
    if (gesture.data.tap) {
      info += ` Tap: ${gesture.data.tap.tapCount}x`;
    }
    
    if (gesture.data.undo) {
      info += ` Undo: ${(gesture.data.undo.confirmationProgress * 100).toFixed(0)}%`;
    }
    
    return info;
  }
}