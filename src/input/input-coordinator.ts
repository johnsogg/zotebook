import { Vec2 } from '../core/math/vec2.js';
import { TransformContext } from '../core/math/pt.js';
import { PointerEventManager, PointerEventData, PointerEventHandlers } from './pointer-events.js';
import { TouchStateManager, TouchMode, TouchStateEventHandlers, AnyTouchGesture } from './touch-state.js';

/**
 * Input Event Coordinator - Central hub for all input processing in Zotebook.
 * Coordinates between pointer events, touch state management, and application logic.
 * Provides a clean interface for higher-level systems to receive processed input events.
 */

export interface InputEventHandlers {
  // Drawing events
  onDrawingStarted?: (position: Vec2, gesture: AnyTouchGesture) => void;
  onDrawingMoved?: (position: Vec2, gesture: AnyTouchGesture) => void;
  onDrawingEnded?: (gesture: AnyTouchGesture) => void;
  
  // Navigation events  
  onPanStarted?: (centroid: Vec2, gesture: AnyTouchGesture) => void;
  onPanMoved?: (delta: Vec2, centroid: Vec2, gesture: AnyTouchGesture) => void;
  onPanEnded?: (totalDelta: Vec2, gesture: AnyTouchGesture) => void;
  
  onZoomStarted?: (centroid: Vec2, gesture: AnyTouchGesture) => void;
  onZoomChanged?: (factor: number, centroid: Vec2, gesture: AnyTouchGesture) => void;
  onZoomEnded?: (totalFactor: number, gesture: AnyTouchGesture) => void;
  
  // Utility events
  onUndoTriggered?: (position: Vec2, gesture: AnyTouchGesture) => void;
  
  // Mode change events
  onInputModeChanged?: (previousMode: TouchMode, currentMode: TouchMode) => void;
  
  // Error/debug events
  onInputError?: (error: Error, context: any) => void;
  onPerformanceWarning?: (metrics: PerformanceMetrics) => void;
}

export interface PerformanceMetrics {
  readonly inputLatency: number;        // ms from hardware event to processed event
  readonly eventsPerSecond: number;     // Input event rate
  readonly droppedEvents: number;       // Events dropped due to performance issues
  readonly memoryUsage: number;         // Approximate memory usage in bytes
}

export interface InputCoordinatorOptions {
  readonly element: HTMLElement;
  readonly transformContext: TransformContext;
  readonly enablePerformanceMonitoring?: boolean;
  readonly maxEventsPerSecond?: number;  // Performance throttling
  readonly enableDebugVisualization?: boolean;
}

/**
 * Central coordinator for all input processing.
 * Manages the flow from raw pointer events to high-level application events.
 */
export class InputCoordinator {
  private readonly element: HTMLElement;
  private transformContext: TransformContext;
  private pointerManager: PointerEventManager;
  private touchStateManager: TouchStateManager;
  private handlers: InputEventHandlers = {};
  private isActive = false;
  
  // Performance monitoring
  private readonly enablePerformanceMonitoring: boolean;
  private performanceStartTime = 0;
  private eventCount = 0;
  private droppedEventCount = 0;
  private lastPerformanceCheck = 0;
  
  // Event throttling
  private readonly maxEventsPerSecond: number;
  private lastEventTime = 0;
  private eventQueue: (() => void)[] = [];
  private isProcessingQueue = false;
  
  // Debug visualization
  private readonly enableDebugVisualization: boolean;
  private debugOverlay?: HTMLElement;
  
  constructor(options: InputCoordinatorOptions) {
    this.element = options.element;
    this.transformContext = options.transformContext;
    this.enablePerformanceMonitoring = options.enablePerformanceMonitoring ?? false;
    this.maxEventsPerSecond = options.maxEventsPerSecond ?? 240; // 240 FPS max
    this.enableDebugVisualization = options.enableDebugVisualization ?? false;
    
    // Initialize sub-systems
    this.pointerManager = new PointerEventManager(this.element, this.transformContext);
    this.touchStateManager = new TouchStateManager();
    
    this.setupEventHandlers();
    
    if (this.enableDebugVisualization) {
      this.createDebugOverlay();
    }
  }

  /**
   * Activate input processing
   */
  activate(handlers: InputEventHandlers): void {
    if (this.isActive) {
      this.deactivate();
    }
    
    this.handlers = handlers;
    this.isActive = true;
    
    // Attach pointer event handlers
    this.pointerManager.attach({
      onPointerDown: this.handlePointerDown,
      onPointerMove: this.handlePointerMove,
      onPointerUp: this.handlePointerUp,
      onPointerCancel: this.handlePointerCancel
    });
    
    if (this.enablePerformanceMonitoring) {
      this.startPerformanceMonitoring();
    }
  }

  /**
   * Deactivate input processing
   */
  deactivate(): void {
    if (!this.isActive) return;
    
    this.pointerManager.detach();
    this.touchStateManager.reset();
    this.isActive = false;
    this.handlers = {};
    
    if (this.enablePerformanceMonitoring) {
      this.stopPerformanceMonitoring();
    }
  }

  /**
   * Update the transform context (called when viewport changes)
   */
  updateTransformContext(context: TransformContext): void {
    this.transformContext = context;
    this.pointerManager.updateTransformContext(context);
  }

  /**
   * Get current input performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    const now = performance.now();
    const timeDelta = now - this.performanceStartTime;
    const eventsPerSecond = timeDelta > 0 ? (this.eventCount / timeDelta) * 1000 : 0;
    
    return {
      inputLatency: this.calculateCurrentLatency(),
      eventsPerSecond,
      droppedEvents: this.droppedEventCount,
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  /**
   * Force reset all input state (useful for error recovery)
   */
  reset(): void {
    this.touchStateManager.reset();
    this.eventQueue.length = 0;
    this.droppedEventCount = 0;
    this.eventCount = 0;
  }

  /**
   * Setup event handlers for touch state management
   */
  private setupEventHandlers(): void {
    // Touch state event handlers
    const touchStateHandlers: TouchStateEventHandlers = {
      onTouchModeChanged: (previousMode, currentMode) => {
        this.handleTouchModeChanged(previousMode, currentMode);
      },
      onGestureStarted: (gesture) => {
        this.handleGestureStarted(gesture);
      },
      onGestureUpdated: (gesture) => {
        this.handleGestureUpdated(gesture);
      },
      onGestureEnded: (gesture) => {
        this.handleGestureEnded(gesture);
      },
      onGestureCancelled: (gesture) => {
        this.handleGestureCancelled(gesture);
      }
    };
    
    this.touchStateManager.setHandlers(touchStateHandlers);
  }

  /**
   * Handle raw pointer down events
   */
  private handlePointerDown = (event: PointerEventData): void => {
    this.throttleEvent(() => {
      try {
        this.touchStateManager.handlePointerDown(event);
        this.updateDebugVisualization();
      } catch (error) {
        this.handleInputError(error, { event: 'pointerdown', pointer: event.pointer });
      }
    });
  };

  /**
   * Handle raw pointer move events
   */
  private handlePointerMove = (event: PointerEventData): void => {
    this.throttleEvent(() => {
      try {
        this.touchStateManager.handlePointerMove(event);
        this.updateDebugVisualization();
      } catch (error) {
        this.handleInputError(error, { event: 'pointermove', pointer: event.pointer });
      }
    });
  };

  /**
   * Handle raw pointer up events
   */
  private handlePointerUp = (event: PointerEventData): void => {
    this.throttleEvent(() => {
      try {
        this.touchStateManager.handlePointerUp(event);
        this.updateDebugVisualization();
      } catch (error) {
        this.handleInputError(error, { event: 'pointerup', pointer: event.pointer });
      }
    });
  };

  /**
   * Handle raw pointer cancel events
   */
  private handlePointerCancel = (event: PointerEventData): void => {
    this.throttleEvent(() => {
      try {
        this.touchStateManager.handlePointerCancel(event);
        this.updateDebugVisualization();
      } catch (error) {
        this.handleInputError(error, { event: 'pointercancel', pointer: event.pointer });
      }
    });
  };

  /**
   * Handle touch mode changes
   */
  private handleTouchModeChanged(previousMode: TouchMode, currentMode: TouchMode): void {
    if (this.handlers.onInputModeChanged) {
      this.handlers.onInputModeChanged(previousMode, currentMode);
    }
  }

  /**
   * Handle gesture started events
   */
  private handleGestureStarted(gesture: AnyTouchGesture): void {
    switch (gesture.type) {
      case TouchMode.DRAWING:
        if (this.handlers.onDrawingStarted) {
          const position = gesture.centroid;
          this.handlers.onDrawingStarted(position, gesture);
        }
        break;
        
      case TouchMode.PAN_ZOOM:
        if (this.handlers.onPanStarted || this.handlers.onZoomStarted) {
          const centroid = gesture.centroid;
          if (this.handlers.onPanStarted) {
            this.handlers.onPanStarted(centroid, gesture);
          }
          if (this.handlers.onZoomStarted) {
            this.handlers.onZoomStarted(centroid, gesture);
          }
        }
        break;
        
      case TouchMode.UNDO:
        // Undo is handled on gesture end, not start
        break;
    }
  }

  /**
   * Handle gesture updated events
   */
  private handleGestureUpdated(gesture: AnyTouchGesture): void {
    switch (gesture.type) {
      case TouchMode.DRAWING:
        if (this.handlers.onDrawingMoved) {
          const position = gesture.centroid;
          this.handlers.onDrawingMoved(position, gesture);
        }
        break;
        
      case TouchMode.PAN_ZOOM:
        const panZoomGesture = gesture as any; // Type assertion for PanZoomGesture
        
        if (this.handlers.onPanMoved && panZoomGesture.data) {
          this.handlers.onPanMoved(
            panZoomGesture.data.panDelta,
            panZoomGesture.data.currentCentroid,
            gesture
          );
        }
        
        if (this.handlers.onZoomChanged && panZoomGesture.data) {
          this.handlers.onZoomChanged(
            panZoomGesture.data.zoomFactor,
            panZoomGesture.data.currentCentroid,
            gesture
          );
        }
        break;
    }
  }

  /**
   * Handle gesture ended events
   */
  private handleGestureEnded(gesture: AnyTouchGesture): void {
    switch (gesture.type) {
      case TouchMode.DRAWING:
        if (this.handlers.onDrawingEnded) {
          this.handlers.onDrawingEnded(gesture);
        }
        break;
        
      case TouchMode.PAN_ZOOM:
        const panZoomGesture = gesture as any; // Type assertion for PanZoomGesture
        
        if (this.handlers.onPanEnded && panZoomGesture.data) {
          this.handlers.onPanEnded(panZoomGesture.data.panDelta, gesture);
        }
        
        if (this.handlers.onZoomEnded && panZoomGesture.data) {
          this.handlers.onZoomEnded(panZoomGesture.data.zoomFactor, gesture);
        }
        break;
        
      case TouchMode.UNDO:
        if (this.handlers.onUndoTriggered) {
          this.handlers.onUndoTriggered(gesture.centroid, gesture);
        }
        break;
    }
  }

  /**
   * Handle gesture cancelled events
   */
  private handleGestureCancelled(gesture: AnyTouchGesture): void {
    // For now, treat cancellation the same as ending
    // Could add specific cancellation handlers later
    this.handleGestureEnded(gesture);
  }

  /**
   * Throttle events to prevent overwhelming the system
   */
  private throttleEvent(eventHandler: () => void): void {
    const now = performance.now();
    const timeSinceLastEvent = now - this.lastEventTime;
    const minEventInterval = 1000 / this.maxEventsPerSecond;
    
    if (timeSinceLastEvent >= minEventInterval) {
      // Process event immediately
      eventHandler();
      this.lastEventTime = now;
      this.eventCount++;
    } else if (this.eventQueue.length < 100) {
      // Queue event for later processing
      this.eventQueue.push(eventHandler);
      this.processEventQueue();
    } else {
      // Drop event due to queue overflow
      this.droppedEventCount++;
    }
  }

  /**
   * Process queued events
   */
  private processEventQueue(): void {
    if (this.isProcessingQueue || this.eventQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    
    requestAnimationFrame(() => {
      const batchSize = Math.min(5, this.eventQueue.length);
      
      for (let i = 0; i < batchSize; i++) {
        const eventHandler = this.eventQueue.shift();
        if (eventHandler) {
          eventHandler();
          this.eventCount++;
        }
      }
      
      this.isProcessingQueue = false;
      
      // Continue processing if more events are queued
      if (this.eventQueue.length > 0) {
        this.processEventQueue();
      }
    });
  }

  /**
   * Handle input processing errors
   */
  private handleInputError(error: Error, context: any): void {
    console.error('Input processing error:', error, context);
    
    if (this.handlers.onInputError) {
      this.handlers.onInputError(error, context);
    }
    
    // Reset state to prevent cascade failures
    this.touchStateManager.reset();
  }

  /**
   * Start performance monitoring
   */
  private startPerformanceMonitoring(): void {
    this.performanceStartTime = performance.now();
    this.lastPerformanceCheck = this.performanceStartTime;
    
    // Check performance every second
    const checkInterval = setInterval(() => {
      if (!this.isActive) {
        clearInterval(checkInterval);
        return;
      }
      
      const metrics = this.getPerformanceMetrics();
      
      // Check for performance issues
      if (metrics.inputLatency > 32 || metrics.droppedEvents > 10) {
        if (this.handlers.onPerformanceWarning) {
          this.handlers.onPerformanceWarning(metrics);
        }
      }
    }, 1000);
  }

  /**
   * Stop performance monitoring
   */
  private stopPerformanceMonitoring(): void {
    // Cleanup is handled by the interval check in startPerformanceMonitoring
  }

  /**
   * Calculate current input latency
   */
  private calculateCurrentLatency(): number {
    // This is a simplified calculation
    // In practice, would measure from hardware event to processed event
    const now = performance.now();
    return now - this.lastEventTime;
  }

  /**
   * Estimate memory usage
   */
  private estimateMemoryUsage(): number {
    // Rough estimate based on active components
    const baseSize = 1024; // Base coordinator size
    const pointerManagerSize = this.pointerManager.activePointerCount * 200;
    const touchStateSize = 512;
    const queueSize = this.eventQueue.length * 100;
    
    return baseSize + pointerManagerSize + touchStateSize + queueSize;
  }

  /**
   * Create debug visualization overlay
   */
  private createDebugOverlay(): void {
    this.debugOverlay = document.createElement('div');
    this.debugOverlay.style.position = 'absolute';
    this.debugOverlay.style.top = '10px';
    this.debugOverlay.style.right = '10px';
    this.debugOverlay.style.padding = '10px';
    this.debugOverlay.style.background = 'rgba(0,0,0,0.8)';
    this.debugOverlay.style.color = 'white';
    this.debugOverlay.style.fontFamily = 'monospace';
    this.debugOverlay.style.fontSize = '12px';
    this.debugOverlay.style.borderRadius = '4px';
    this.debugOverlay.style.zIndex = '10000';
    this.debugOverlay.style.pointerEvents = 'none';
    
    document.body.appendChild(this.debugOverlay);
  }

  /**
   * Update debug visualization
   */
  private updateDebugVisualization(): void {
    if (!this.debugOverlay) return;
    
    const activePointers = this.pointerManager.activePointerCount;
    const touchMode = this.touchStateManager.touchMode;
    const gesture = this.touchStateManager.activeGesture;
    const metrics = this.enablePerformanceMonitoring ? this.getPerformanceMetrics() : null;
    
    let html = `Active Pointers: ${activePointers}<br>`;
    html += `Touch Mode: ${touchMode}<br>`;
    html += `Active Gesture: ${gesture ? gesture.type : 'none'}<br>`;
    
    if (metrics) {
      html += `<br>Performance:<br>`;
      html += `Latency: ${metrics.inputLatency.toFixed(1)}ms<br>`;
      html += `Events/sec: ${metrics.eventsPerSecond.toFixed(1)}<br>`;
      html += `Dropped: ${metrics.droppedEvents}<br>`;
    }
    
    this.debugOverlay.innerHTML = html;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.deactivate();
    
    if (this.debugOverlay) {
      document.body.removeChild(this.debugOverlay);
      this.debugOverlay = undefined;
    }
  }
}