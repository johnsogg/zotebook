import { Vec2 } from '../core/math/vec2.js';
import { Pt, TransformContext } from '../core/math/pt.js';
import { Segment } from '../core/geometry/segment.js';
import { InputCoordinator, InputEventHandlers, InputCoordinatorOptions } from './input-coordinator.js';
import { StrokeProcessor, ProcessedStroke, StrokePoint } from './stroke-processor.js';
import { StrokeToGeometryConverter, GeometryFitResult } from './stroke-to-geometry.js';
import { GestureRecognizer, RecognizedGesture, GestureType } from './gesture-recognizer.js';
import { TouchMode, AnyTouchGesture, DrawingGesture } from './touch-state.js';

/**
 * Complete input processing pipeline for Zotebook.
 * Integrates all input systems into a cohesive processing chain:
 * Raw Touch → Gestures → Strokes → Geometry → Application Events
 */

export interface InputPipelineEvents {
  // Stroke events
  onStrokeStarted?: (stroke: { id: string; startPoint: Vec2 }) => void;
  onStrokeProgress?: (stroke: { id: string; points: ReadonlyArray<Vec2>; preview?: Segment[] }) => void;
  onStrokeCompleted?: (stroke: ProcessedStroke, geometry: GeometryFitResult[]) => void;
  onStrokeCancelled?: (strokeId: string) => void;
  
  // Navigation events
  onViewportChanged?: (transform: { pan: Vec2; zoom: number; rotation: number }) => void;
  onUndoRequested?: (position: Vec2) => void;
  
  // Interaction events
  onSelectionStarted?: (position: Vec2) => void;
  onSelectionChanged?: (area: { start: Vec2; end: Vec2 }) => void;
  onSelectionCompleted?: (area: { start: Vec2; end: Vec2 }) => void;
  
  // System events
  onInputModeChanged?: (mode: TouchMode) => void;
  onGestureRecognized?: (gesture: RecognizedGesture) => void;
  onError?: (error: Error, context: any) => void;
}

export interface InputPipelineOptions extends InputCoordinatorOptions {
  readonly enableRealTimePreview?: boolean;   // Show geometry preview while drawing
  readonly enableGestureRecognition?: boolean; // Enable advanced gesture recognition
  readonly strokeProcessingDelay?: number;     // Delay before processing stroke (ms)
  readonly previewUpdateInterval?: number;     // How often to update preview (ms)
  readonly enableUndoGesture?: boolean;        // Enable 3-finger undo gesture
}

const DEFAULT_PIPELINE_OPTIONS: Required<Omit<InputPipelineOptions, keyof InputCoordinatorOptions>> = {
  enableRealTimePreview: true,
  enableGestureRecognition: true,
  strokeProcessingDelay: 100,
  previewUpdateInterval: 50,
  enableUndoGesture: true
};

/**
 * Complete input processing pipeline integrating all input systems.
 * Provides a high-level interface for the Zotebook drawing application.
 */
export class InputPipeline {
  private readonly options: InputPipelineOptions;
  private readonly coordinator: InputCoordinator;
  private readonly strokeProcessor: StrokeProcessor;
  private readonly geometryConverter: StrokeToGeometryConverter;
  private readonly gestureRecognizer: GestureRecognizer;
  private handlers: InputPipelineEvents = {};
  
  // Active processing state
  private activeStrokeId: string | null = null;
  private previewUpdateTimer?: number;
  private strokeProcessingTimer?: number;
  private currentViewportTransform = { pan: Vec2.ZERO, zoom: 1.0, rotation: 0 };
  private selectionState: { start?: Vec2; current?: Vec2 } = {};
  
  // Performance tracking
  private processingMetrics = {
    strokesProcessed: 0,
    averageProcessingTime: 0,
    lastProcessingTime: 0
  };

  constructor(options: InputPipelineOptions) {
    this.options = { ...DEFAULT_PIPELINE_OPTIONS, ...options };
    
    // Initialize sub-systems
    this.coordinator = new InputCoordinator(options);
    this.strokeProcessor = new StrokeProcessor({
      enableRealTimeSmoothing: this.options.enableRealTimePreview
    });
    this.geometryConverter = new StrokeToGeometryConverter();
    this.gestureRecognizer = new GestureRecognizer();
    
    this.setupCoordinatorHandlers();
  }

  /**
   * Activate the input pipeline
   */
  activate(handlers: InputPipelineEvents): void {
    this.handlers = handlers;
    this.coordinator.activate(this.createCoordinatorHandlers());
  }

  /**
   * Deactivate the input pipeline
   */
  deactivate(): void {
    this.coordinator.deactivate();
    this.cleanup();
  }

  /**
   * Update transform context (called when viewport changes)
   */
  updateTransformContext(context: TransformContext): void {
    this.coordinator.updateTransformContext(context);
  }

  /**
   * Force reset all input state
   */
  reset(): void {
    this.coordinator.reset();
    this.strokeProcessor.cancelStroke();
    this.gestureRecognizer.reset();
    this.cleanup();
  }

  /**
   * Get current processing metrics
   */
  getMetrics(): {
    input: ReturnType<InputCoordinator['getPerformanceMetrics']>;
    processing: typeof this.processingMetrics;
  } {
    return {
      input: this.coordinator.getPerformanceMetrics(),
      processing: { ...this.processingMetrics }
    };
  }

  /**
   * Setup coordinator event handlers
   */
  private setupCoordinatorHandlers(): void {
    // Implementation moved to createCoordinatorHandlers for clarity
  }

  /**
   * Create coordinator handlers
   */
  private createCoordinatorHandlers(): InputEventHandlers {
    return {
      // Drawing events
      onDrawingStarted: (position, gesture) => {
        this.handleDrawingStarted(position, gesture);
      },
      
      onDrawingMoved: (position, gesture) => {
        this.handleDrawingMoved(position, gesture);
      },
      
      onDrawingEnded: (gesture) => {
        this.handleDrawingEnded(gesture);
      },
      
      // Navigation events
      onPanStarted: (centroid, gesture) => {
        this.handlePanStarted(centroid, gesture);
      },
      
      onPanMoved: (delta, centroid, gesture) => {
        this.handlePanMoved(delta, centroid, gesture);
      },
      
      onPanEnded: (totalDelta, gesture) => {
        this.handlePanEnded(totalDelta, gesture);
      },
      
      onZoomStarted: (centroid, gesture) => {
        this.handleZoomStarted(centroid, gesture);
      },
      
      onZoomChanged: (factor, centroid, gesture) => {
        this.handleZoomChanged(factor, centroid, gesture);
      },
      
      onZoomEnded: (totalFactor, gesture) => {
        this.handleZoomEnded(totalFactor, gesture);
      },
      
      // Utility events
      onUndoTriggered: (position, gesture) => {
        this.handleUndoTriggered(position, gesture);
      },
      
      // Mode changes
      onInputModeChanged: (previousMode, currentMode) => {
        this.handleInputModeChanged(previousMode, currentMode);
      },
      
      // Error handling
      onInputError: (error, context) => {
        this.handleInputError(error, context);
      }
    };
  }

  /**
   * Handle drawing started
   */
  private handleDrawingStarted(position: Vec2, gesture: AnyTouchGesture): void {
    try {
      // Create initial stroke point
      const strokePoint: StrokePoint = {
        position,
        worldPosition: Pt.fromScreen(position, this.coordinator['transformContext'].transforms),
        timestamp: performance.now(),
        pressure: gesture.primaryPointer?.pressure ?? 0.5,
        tiltX: gesture.primaryPointer?.tiltX ?? 0,
        tiltY: gesture.primaryPointer?.tiltY ?? 0,
        velocity: Vec2.ZERO
      };
      
      // Start stroke processing
      this.activeStrokeId = this.strokeProcessor.startStroke(strokePoint);
      
      // Notify application
      if (this.handlers.onStrokeStarted) {
        this.handlers.onStrokeStarted({
          id: this.activeStrokeId,
          startPoint: position
        });
      }
      
      // Start real-time preview if enabled
      if (this.options.enableRealTimePreview) {
        this.startPreviewUpdates();
      }
      
    } catch (error) {
      this.handleError(error as Error, 'drawing_started');
    }
  }

  /**
   * Handle drawing moved
   */
  private handleDrawingMoved(position: Vec2, gesture: AnyTouchGesture): void {
    if (!this.activeStrokeId) return;
    
    try {
      // Create stroke point
      const strokePoint: StrokePoint = {
        position,
        worldPosition: Pt.fromScreen(position, this.coordinator['transformContext'].transforms),
        timestamp: performance.now(),
        pressure: gesture.primaryPointer?.pressure ?? 0.5,
        tiltX: gesture.primaryPointer?.tiltX ?? 0,
        tiltY: gesture.primaryPointer?.tiltY ?? 0,
        velocity: Vec2.ZERO // Will be calculated by stroke processor
      };
      
      // Add point to stroke
      this.strokeProcessor.addPoint(strokePoint);
      
      // Update preview if enabled (but not too frequently)
      if (this.options.enableRealTimePreview && !this.previewUpdateTimer) {
        this.previewUpdateTimer = window.setTimeout(() => {
          this.updateStrokePreview();
          this.previewUpdateTimer = undefined;
        }, this.options.previewUpdateInterval);
      }
      
    } catch (error) {
      this.handleError(error as Error, 'drawing_moved');
    }
  }

  /**
   * Handle drawing ended
   */
  private handleDrawingEnded(gesture: AnyTouchGesture): void {
    if (!this.activeStrokeId) return;
    
    try {
      // Stop preview updates
      this.stopPreviewUpdates();
      
      // Process stroke with slight delay for better performance
      this.strokeProcessingTimer = window.setTimeout(() => {
        this.processCompletedStroke();
      }, this.options.strokeProcessingDelay);
      
    } catch (error) {
      this.handleError(error as Error, 'drawing_ended');
    }
  }

  /**
   * Handle pan navigation
   */
  private handlePanStarted(centroid: Vec2, gesture: AnyTouchGesture): void {
    // Initialize pan state
  }

  private handlePanMoved(delta: Vec2, centroid: Vec2, gesture: AnyTouchGesture): void {
    // Update viewport transform
    this.currentViewportTransform.pan = this.currentViewportTransform.pan.add(delta);
    
    if (this.handlers.onViewportChanged) {
      this.handlers.onViewportChanged(this.currentViewportTransform);
    }
  }

  private handlePanEnded(totalDelta: Vec2, gesture: AnyTouchGesture): void {
    // Finalize pan operation
  }

  /**
   * Handle zoom navigation
   */
  private handleZoomStarted(centroid: Vec2, gesture: AnyTouchGesture): void {
    // Initialize zoom state
  }

  private handleZoomChanged(factor: number, centroid: Vec2, gesture: AnyTouchGesture): void {
    // Update viewport transform
    this.currentViewportTransform.zoom *= factor;
    
    if (this.handlers.onViewportChanged) {
      this.handlers.onViewportChanged(this.currentViewportTransform);
    }
  }

  private handleZoomEnded(totalFactor: number, gesture: AnyTouchGesture): void {
    // Finalize zoom operation
  }

  /**
   * Handle undo gesture
   */
  private handleUndoTriggered(position: Vec2, gesture: AnyTouchGesture): void {
    if (this.handlers.onUndoRequested) {
      this.handlers.onUndoRequested(position);
    }
  }

  /**
   * Handle input mode changes
   */
  private handleInputModeChanged(previousMode: TouchMode, currentMode: TouchMode): void {
    // Cancel any active stroke if switching away from drawing
    if (previousMode === TouchMode.DRAWING && currentMode !== TouchMode.DRAWING) {
      this.cancelActiveStroke();
    }
    
    if (this.handlers.onInputModeChanged) {
      this.handlers.onInputModeChanged(currentMode);
    }
  }

  /**
   * Handle input errors
   */
  private handleInputError(error: Error, context: any): void {
    this.handleError(error, context);
  }

  /**
   * Update stroke preview
   */
  private updateStrokePreview(): void {
    if (!this.activeStrokeId || !this.options.enableRealTimePreview) return;
    
    try {
      const activePoints = this.strokeProcessor.activeStrokePoints;
      const points = activePoints.map(p => p.position);
      
      // Generate preview geometry if we have enough points
      let previewGeometry: Segment[] = [];
      if (points.length >= 3) {
        // Create a simplified stroke for preview
        const previewStroke: ProcessedStroke = {
          id: this.activeStrokeId,
          points: activePoints,
          startTime: activePoints[0]?.timestamp ?? performance.now(),
          endTime: performance.now(),
          boundingBox: this.calculateBoundingBox(points),
          totalLength: this.calculateTotalLength(points),
          averageVelocity: Vec2.ZERO,
          maxVelocity: 0,
          averagePressure: 0.5,
          smoothedPoints: activePoints, // Use raw points for preview
          resampledPoints: activePoints,
          cornerIndices: [],
          qualityScore: 0.5
        };
        
        const geometryResults = this.geometryConverter.convertStroke(previewStroke);
        previewGeometry = geometryResults.map(r => r.segment);
      }
      
      // Notify application of preview update
      if (this.handlers.onStrokeProgress) {
        this.handlers.onStrokeProgress({
          id: this.activeStrokeId,
          points,
          preview: previewGeometry
        });
      }
      
    } catch (error) {
      // Don't let preview errors break the stroke
      console.warn('Preview update error:', error);
    }
  }

  /**
   * Process completed stroke
   */
  private processCompletedStroke(): void {
    if (!this.activeStrokeId) return;
    
    const startTime = performance.now();
    
    try {
      // Finish stroke processing
      const processedStroke = this.strokeProcessor.endStroke();
      
      // Convert to geometry
      const geometryResults = this.geometryConverter.convertStroke(processedStroke);
      
      // Update metrics
      const processingTime = performance.now() - startTime;
      this.updateProcessingMetrics(processingTime);
      
      // Notify application
      if (this.handlers.onStrokeCompleted) {
        this.handlers.onStrokeCompleted(processedStroke, geometryResults);
      }
      
      // Clear active stroke
      this.activeStrokeId = null;
      
    } catch (error) {
      this.handleError(error as Error, 'stroke_processing');
      this.cancelActiveStroke();
    }
  }

  /**
   * Cancel active stroke
   */
  private cancelActiveStroke(): void {
    if (!this.activeStrokeId) return;
    
    const strokeId = this.activeStrokeId;
    this.activeStrokeId = null;
    
    this.strokeProcessor.cancelStroke();
    this.stopPreviewUpdates();
    
    if (this.handlers.onStrokeCancelled) {
      this.handlers.onStrokeCancelled(strokeId);
    }
  }

  /**
   * Start preview updates
   */
  private startPreviewUpdates(): void {
    // Preview updates are handled on-demand in handleDrawingMoved
  }

  /**
   * Stop preview updates
   */
  private stopPreviewUpdates(): void {
    if (this.previewUpdateTimer) {
      clearTimeout(this.previewUpdateTimer);
      this.previewUpdateTimer = undefined;
    }
  }

  /**
   * Update processing metrics
   */
  private updateProcessingMetrics(processingTime: number): void {
    this.processingMetrics.strokesProcessed++;
    this.processingMetrics.lastProcessingTime = processingTime;
    
    // Update running average
    const count = this.processingMetrics.strokesProcessed;
    const prevAvg = this.processingMetrics.averageProcessingTime;
    this.processingMetrics.averageProcessingTime = ((count - 1) * prevAvg + processingTime) / count;
  }

  /**
   * Calculate bounding box for points
   */
  private calculateBoundingBox(points: Vec2[]): { min: Vec2; max: Vec2; size: Vec2 } {
    if (points.length === 0) {
      return { min: Vec2.ZERO, max: Vec2.ZERO, size: Vec2.ZERO };
    }
    
    let minX = points[0].x, minY = points[0].y;
    let maxX = minX, maxY = minY;
    
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    
    const min = new Vec2(minX, minY);
    const max = new Vec2(maxX, maxY);
    const size = max.subtract(min);
    
    return { min, max, size };
  }

  /**
   * Calculate total length of stroke
   */
  private calculateTotalLength(points: Vec2[]): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += points[i - 1].distanceTo(points[i]);
    }
    return length;
  }

  /**
   * Handle errors with context
   */
  private handleError(error: Error, context: string): void {
    console.error(`Input pipeline error [${context}]:`, error);
    
    if (this.handlers.onError) {
      this.handlers.onError(error, context);
    }
    
    // Try to recover gracefully
    if (context.includes('stroke') || context.includes('drawing')) {
      this.cancelActiveStroke();
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    this.stopPreviewUpdates();
    
    if (this.strokeProcessingTimer) {
      clearTimeout(this.strokeProcessingTimer);
      this.strokeProcessingTimer = undefined;
    }
    
    this.activeStrokeId = null;
    this.selectionState = {};
  }

  /**
   * Dispose of the pipeline and cleanup resources
   */
  dispose(): void {
    this.deactivate();
    this.coordinator.dispose();
  }
}

/**
 * Utility functions for input pipeline analysis and debugging
 */
export namespace InputPipelineUtils {
  /**
   * Create a debug overlay for input pipeline visualization
   */
  export function createDebugOverlay(pipeline: InputPipeline): HTMLElement {
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '10px';
    overlay.style.left = '10px';
    overlay.style.background = 'rgba(0,0,0,0.8)';
    overlay.style.color = 'white';
    overlay.style.padding = '10px';
    overlay.style.fontFamily = 'monospace';
    overlay.style.fontSize = '12px';
    overlay.style.zIndex = '10000';
    overlay.style.borderRadius = '4px';
    overlay.style.pointerEvents = 'none';
    
    // Update overlay periodically
    const updateOverlay = () => {
      const metrics = pipeline.getMetrics();
      
      overlay.innerHTML = `
        <strong>Input Pipeline Debug</strong><br>
        Input Latency: ${metrics.input.inputLatency.toFixed(1)}ms<br>
        Events/sec: ${metrics.input.eventsPerSecond.toFixed(1)}<br>
        Dropped Events: ${metrics.input.droppedEvents}<br>
        <br>
        Strokes Processed: ${metrics.processing.strokesProcessed}<br>
        Avg Processing: ${metrics.processing.averageProcessingTime.toFixed(1)}ms<br>
        Last Processing: ${metrics.processing.lastProcessingTime.toFixed(1)}ms<br>
      `;
    };
    
    updateOverlay();
    const interval = setInterval(updateOverlay, 1000);
    
    // Cleanup function
    (overlay as any).dispose = () => {
      clearInterval(interval);
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    };
    
    return overlay;
  }

  /**
   * Analyze input pipeline performance
   */
  export function analyzePerformance(
    pipeline: InputPipeline,
    duration: number = 5000
  ): Promise<{
    averageLatency: number;
    maxLatency: number;
    averageProcessingTime: number;
    maxProcessingTime: number;
    throughput: number;
  }> {
    return new Promise((resolve) => {
      const samples: { latency: number; processingTime: number }[] = [];
      const startTime = performance.now();
      
      const sampleInterval = setInterval(() => {
        const metrics = pipeline.getMetrics();
        samples.push({
          latency: metrics.input.inputLatency,
          processingTime: metrics.processing.lastProcessingTime
        });
      }, 100);
      
      setTimeout(() => {
        clearInterval(sampleInterval);
        
        const latencies = samples.map(s => s.latency);
        const processingTimes = samples.map(s => s.processingTime);
        
        const result = {
          averageLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
          maxLatency: Math.max(...latencies),
          averageProcessingTime: processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length,
          maxProcessingTime: Math.max(...processingTimes),
          throughput: samples.length / (duration / 1000)
        };
        
        resolve(result);
      }, duration);
    });
  }
}