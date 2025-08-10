import { Vec2 } from '../core/math/vec2.js';
import { Pt } from '../core/math/pt.js';

/**
 * Stroke capture and processing system for Zotebook's drawing interface.
 * Handles real-time stroke collection, smoothing, and preparation for geometric analysis.
 * Based on the original Zotebook stroke processing with enhancements for web platform.
 */

export interface StrokePoint {
  readonly position: Vec2;       // Screen coordinates
  readonly worldPosition: Pt;    // World coordinates
  readonly timestamp: number;    // High-precision timestamp
  readonly pressure: number;     // Pressure value 0.0-1.0
  readonly tiltX: number;        // Stylus tilt X (-90 to 90)
  readonly tiltY: number;        // Stylus tilt Y (-90 to 90)
  readonly velocity: Vec2;       // Velocity at this point (pixels/second)
}

export interface RawStroke {
  readonly id: string;
  readonly points: ReadonlyArray<StrokePoint>;
  readonly startTime: number;
  readonly endTime: number;
  readonly boundingBox: { min: Vec2; max: Vec2; size: Vec2 };
  readonly totalLength: number;
  readonly averageVelocity: Vec2;
  readonly maxVelocity: number;
  readonly averagePressure: number;
}

export interface ProcessedStroke extends RawStroke {
  readonly smoothedPoints: ReadonlyArray<StrokePoint>;
  readonly resampledPoints: ReadonlyArray<StrokePoint>;
  readonly cornerIndices: ReadonlyArray<number>;
  readonly qualityScore: number; // 0.0-1.0, higher is better
}

export interface StrokeProcessingOptions {
  readonly targetSpacing: number;        // Target spacing between points (pixels)
  readonly smoothingFactor: number;      // 0.0-1.0, higher = more smoothing
  readonly minCornerAngle: number;       // Minimum angle for corner detection (radians)
  readonly velocityWindowSize: number;   // Window size for velocity calculation
  readonly pressureSensitivity: number;  // Pressure influence on stroke width
  readonly enableRealTimeSmoothing: boolean;
  readonly maxPointsPerStroke: number;   // Performance limit
}

const DEFAULT_PROCESSING_OPTIONS: StrokeProcessingOptions = {
  targetSpacing: 2.0,
  smoothingFactor: 0.3,
  minCornerAngle: Math.PI / 6, // 30 degrees
  velocityWindowSize: 3,
  pressureSensitivity: 0.5,
  enableRealTimeSmoothing: true,
  maxPointsPerStroke: 2000
};

/**
 * Real-time stroke capture and processing system.
 * Efficiently handles stroke data collection with configurable processing options.
 */
export class StrokeProcessor {
  private options: StrokeProcessingOptions;
  private activeStroke: {
    id: string;
    points: StrokePoint[];
    startTime: number;
    lastProcessedIndex: number;
  } | null = null;
  
  // Object pooling for performance
  private pointPool: StrokePoint[] = [];
  private strokeIdCounter = 0;
  
  constructor(options: Partial<StrokeProcessingOptions> = {}) {
    this.options = { ...DEFAULT_PROCESSING_OPTIONS, ...options };
  }

  /**
   * Start a new stroke capture
   */
  startStroke(initialPoint: StrokePoint): string {
    const strokeId = this.generateStrokeId();
    
    this.activeStroke = {
      id: strokeId,
      points: [initialPoint],
      startTime: initialPoint.timestamp,
      lastProcessedIndex: 0
    };
    
    return strokeId;
  }

  /**
   * Add a point to the active stroke
   */
  addPoint(point: StrokePoint): void {
    if (!this.activeStroke) {
      throw new Error('No active stroke. Call startStroke() first.');
    }
    
    // Performance limit check
    if (this.activeStroke.points.length >= this.options.maxPointsPerStroke) {
      console.warn(`Stroke point limit reached (${this.options.maxPointsPerStroke}). Point dropped.`);
      return;
    }
    
    // Calculate velocity if we have previous points
    let velocity = Vec2.ZERO;
    if (this.activeStroke.points.length > 0) {
      velocity = this.calculateVelocity(point, this.activeStroke.points);
    }
    
    const enhancedPoint: StrokePoint = { ...point, velocity };
    this.activeStroke.points.push(enhancedPoint);
    
    // Real-time smoothing if enabled
    if (this.options.enableRealTimeSmoothing) {
      this.applyRealTimeSmoothing();
    }
  }

  /**
   * Finish the active stroke and return processed result
   */
  endStroke(): ProcessedStroke {
    if (!this.activeStroke) {
      throw new Error('No active stroke to end.');
    }
    
    const endTime = performance.now();
    const rawStroke = this.createRawStroke(this.activeStroke, endTime);
    const processedStroke = this.processStroke(rawStroke);
    
    // Clean up
    this.recyclePoints(this.activeStroke.points);
    this.activeStroke = null;
    
    return processedStroke;
  }

  /**
   * Cancel the active stroke without processing
   */
  cancelStroke(): void {
    if (this.activeStroke) {
      this.recyclePoints(this.activeStroke.points);
      this.activeStroke = null;
    }
  }

  /**
   * Get the current active stroke points (for real-time display)
   */
  get activeStrokePoints(): ReadonlyArray<StrokePoint> {
    return this.activeStroke?.points ?? [];
  }

  /**
   * Check if a stroke is currently being captured
   */
  get isCapturing(): boolean {
    return this.activeStroke !== null;
  }

  /**
   * Update processing options
   */
  updateOptions(newOptions: Partial<StrokeProcessingOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Process a raw stroke into a polished stroke suitable for geometric analysis
   */
  processStroke(rawStroke: RawStroke): ProcessedStroke {
    // Step 1: Remove duplicate points
    const deduplicated = this.removeDuplicatePoints(rawStroke.points);
    
    // Step 2: Apply smoothing
    const smoothed = this.applySmoothingFilter(deduplicated);
    
    // Step 3: Resample to consistent spacing
    const resampled = this.resampleStroke(smoothed);
    
    // Step 4: Detect corners
    const cornerIndices = this.detectCorners(resampled);
    
    // Step 5: Calculate quality score
    const qualityScore = this.calculateQualityScore(rawStroke, smoothed, resampled);
    
    return {
      ...rawStroke,
      smoothedPoints: smoothed,
      resampledPoints: resampled,
      cornerIndices,
      qualityScore
    };
  }

  /**
   * Calculate velocity for a new point based on recent points
   */
  private calculateVelocity(newPoint: StrokePoint, existingPoints: StrokePoint[]): Vec2 {
    const windowSize = Math.min(this.options.velocityWindowSize, existingPoints.length);
    if (windowSize === 0) return Vec2.ZERO;
    
    // Use recent points for velocity calculation
    const recentPoints = existingPoints.slice(-windowSize);
    const oldestPoint = recentPoints[0];
    
    const timeDelta = newPoint.timestamp - oldestPoint.timestamp;
    if (timeDelta <= 0) return Vec2.ZERO;
    
    const positionDelta = newPoint.position.subtract(oldestPoint.position);
    return positionDelta.divide(timeDelta / 1000); // pixels per second
  }

  /**
   * Apply real-time smoothing to the last few points
   */
  private applyRealTimeSmoothing(): void {
    if (!this.activeStroke || this.activeStroke.points.length < 3) return;
    
    const points = this.activeStroke.points;
    const lastIndex = points.length - 1;
    const smoothingRadius = 2;
    
    // Only smooth points that haven't been processed yet
    const startIndex = Math.max(this.activeStroke.lastProcessedIndex, smoothingRadius);
    const endIndex = Math.max(lastIndex - smoothingRadius, startIndex);
    
    for (let i = startIndex; i <= endIndex; i++) {
      const smoothedPoint = this.smoothPointAtIndex(points, i);
      points[i] = smoothedPoint;
    }
    
    this.activeStroke.lastProcessedIndex = endIndex;
  }

  /**
   * Smooth a single point using surrounding points
   */
  private smoothPointAtIndex(points: StrokePoint[], index: number): StrokePoint {
    const windowSize = 2;
    const start = Math.max(0, index - windowSize);
    const end = Math.min(points.length - 1, index + windowSize);
    
    let sumPosition = Vec2.ZERO;
    let sumPressure = 0;
    let count = 0;
    
    for (let i = start; i <= end; i++) {
      const weight = 1.0 - Math.abs(i - index) / (windowSize + 1);
      sumPosition = sumPosition.add(points[i].position.multiply(weight));
      sumPressure += points[i].pressure * weight;
      count += weight;
    }
    
    if (count === 0) return points[index];
    
    const originalPoint = points[index];
    const smoothedPosition = sumPosition.divide(count);
    const smoothedPressure = sumPressure / count;
    
    // Blend with original based on smoothing factor
    const factor = this.options.smoothingFactor;
    const blendedPosition = originalPoint.position.lerp(smoothedPosition, factor);
    const blendedPressure = originalPoint.pressure * (1 - factor) + smoothedPressure * factor;
    
    return {
      ...originalPoint,
      position: blendedPosition,
      pressure: blendedPressure
    };
  }

  /**
   * Create a raw stroke from active stroke data
   */
  private createRawStroke(activeStroke: typeof this.activeStroke, endTime: number): RawStroke {
    if (!activeStroke) {
      throw new Error('No active stroke data');
    }
    
    const points = activeStroke.points;
    const boundingBox = this.calculateBoundingBox(points);
    const totalLength = this.calculateTotalLength(points);
    const averageVelocity = this.calculateAverageVelocity(points);
    const maxVelocity = this.calculateMaxVelocity(points);
    const averagePressure = this.calculateAveragePressure(points);
    
    return {
      id: activeStroke.id,
      points,
      startTime: activeStroke.startTime,
      endTime,
      boundingBox,
      totalLength,
      averageVelocity,
      maxVelocity,
      averagePressure
    };
  }

  /**
   * Remove duplicate points that are too close together
   */
  private removeDuplicatePoints(points: ReadonlyArray<StrokePoint>): StrokePoint[] {
    if (points.length <= 1) return [...points];
    
    const minDistance = this.options.targetSpacing * 0.5;
    const result: StrokePoint[] = [points[0]];
    
    for (let i = 1; i < points.length; i++) {
      const currentPoint = points[i];
      const lastPoint = result[result.length - 1];
      
      const distance = currentPoint.position.distanceTo(lastPoint.position);
      if (distance >= minDistance) {
        result.push(currentPoint);
      }
    }
    
    return result;
  }

  /**
   * Apply smoothing filter to stroke points
   */
  private applySmoothingFilter(points: StrokePoint[]): StrokePoint[] {
    if (points.length <= 2) return [...points];
    
    const result: StrokePoint[] = [...points];
    const windowSize = 2;
    
    // Apply multiple smoothing passes for better results
    const passes = Math.ceil(this.options.smoothingFactor * 3);
    
    for (let pass = 0; pass < passes; pass++) {
      for (let i = windowSize; i < result.length - windowSize; i++) {
        result[i] = this.smoothPointAtIndex(result, i);
      }
    }
    
    return result;
  }

  /**
   * Resample stroke to consistent point spacing
   */
  private resampleStroke(points: StrokePoint[]): StrokePoint[] {
    if (points.length <= 1) return [...points];
    
    const result: StrokePoint[] = [points[0]];
    const targetSpacing = this.options.targetSpacing;
    let accumulatedDistance = 0;
    
    for (let i = 1; i < points.length; i++) {
      const previousPoint = points[i - 1];
      const currentPoint = points[i];
      const segmentLength = previousPoint.position.distanceTo(currentPoint.position);
      
      accumulatedDistance += segmentLength;
      
      while (accumulatedDistance >= targetSpacing) {
        // Interpolate a new point at the target spacing
        const excess = accumulatedDistance - targetSpacing;
        const t = 1 - (excess / segmentLength);
        
        const interpolatedPoint = this.interpolateStrokePoints(previousPoint, currentPoint, t);
        result.push(interpolatedPoint);
        
        accumulatedDistance = excess;
      }
    }
    
    // Always include the last point
    result.push(points[points.length - 1]);
    
    return result;
  }

  /**
   * Detect corners in the stroke
   */
  private detectCorners(points: StrokePoint[]): number[] {
    if (points.length < 3) return [];
    
    const corners: number[] = [];
    const minAngle = this.options.minCornerAngle;
    const windowSize = 3;
    
    for (let i = windowSize; i < points.length - windowSize; i++) {
      const angle = this.calculateAngleAtPoint(points, i, windowSize);
      
      if (angle < minAngle) {
        corners.push(i);
      }
    }
    
    return corners;
  }

  /**
   * Calculate angle at a specific point
   */
  private calculateAngleAtPoint(points: StrokePoint[], index: number, windowSize: number): number {
    const beforeIndex = index - windowSize;
    const afterIndex = index + windowSize;
    
    if (beforeIndex < 0 || afterIndex >= points.length) {
      return Math.PI; // No corner
    }
    
    const before = points[beforeIndex].position;
    const current = points[index].position;
    const after = points[afterIndex].position;
    
    const vec1 = current.subtract(before).normalized;
    const vec2 = after.subtract(current).normalized;
    
    const dot = vec1.dot(vec2);
    return Math.acos(Math.max(-1, Math.min(1, dot)));
  }

  /**
   * Calculate quality score for the stroke
   */
  private calculateQualityScore(raw: RawStroke, smoothed: StrokePoint[], resampled: StrokePoint[]): number {
    let score = 1.0;
    
    // Penalize very short strokes
    if (raw.totalLength < 10) score *= 0.5;
    
    // Penalize strokes with too few points
    if (raw.points.length < 5) score *= 0.7;
    
    // Penalize strokes with excessive jitter
    const jitterRatio = this.calculateJitterRatio(raw.points);
    score *= Math.max(0.1, 1 - jitterRatio);
    
    // Reward consistent velocity
    const velocityConsistency = this.calculateVelocityConsistency(raw.points);
    score *= 0.5 + 0.5 * velocityConsistency;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate various stroke metrics
   */
  private calculateBoundingBox(points: ReadonlyArray<StrokePoint>) {
    if (points.length === 0) {
      return { min: Vec2.ZERO, max: Vec2.ZERO, size: Vec2.ZERO };
    }
    
    let minX = points[0].position.x;
    let minY = points[0].position.y;
    let maxX = minX;
    let maxY = minY;
    
    for (const point of points) {
      minX = Math.min(minX, point.position.x);
      minY = Math.min(minY, point.position.y);
      maxX = Math.max(maxX, point.position.x);
      maxY = Math.max(maxY, point.position.y);
    }
    
    const min = new Vec2(minX, minY);
    const max = new Vec2(maxX, maxY);
    const size = max.subtract(min);
    
    return { min, max, size };
  }

  private calculateTotalLength(points: ReadonlyArray<StrokePoint>): number {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += points[i - 1].position.distanceTo(points[i].position);
    }
    return length;
  }

  private calculateAverageVelocity(points: ReadonlyArray<StrokePoint>): Vec2 {
    if (points.length === 0) return Vec2.ZERO;
    
    let sum = Vec2.ZERO;
    for (const point of points) {
      sum = sum.add(point.velocity);
    }
    return sum.divide(points.length);
  }

  private calculateMaxVelocity(points: ReadonlyArray<StrokePoint>): number {
    let max = 0;
    for (const point of points) {
      max = Math.max(max, point.velocity.length);
    }
    return max;
  }

  private calculateAveragePressure(points: ReadonlyArray<StrokePoint>): number {
    if (points.length === 0) return 0;
    
    let sum = 0;
    for (const point of points) {
      sum += point.pressure;
    }
    return sum / points.length;
  }

  private calculateJitterRatio(points: ReadonlyArray<StrokePoint>): number {
    if (points.length < 3) return 0;
    
    let totalDirectionChange = 0;
    let totalLength = 0;
    
    for (let i = 1; i < points.length - 1; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      const vec1 = curr.position.subtract(prev.position);
      const vec2 = next.position.subtract(curr.position);
      
      if (vec1.lengthSquared > 0 && vec2.lengthSquared > 0) {
        const angle = vec1.angleTo(vec2);
        totalDirectionChange += Math.abs(angle);
        totalLength += vec1.length;
      }
    }
    
    return totalLength > 0 ? totalDirectionChange / totalLength : 0;
  }

  private calculateVelocityConsistency(points: ReadonlyArray<StrokePoint>): number {
    if (points.length < 2) return 1.0;
    
    let velocityVariance = 0;
    const avgVelocity = this.calculateAverageVelocity(points).length;
    
    for (const point of points) {
      const diff = point.velocity.length - avgVelocity;
      velocityVariance += diff * diff;
    }
    
    velocityVariance /= points.length;
    const coefficient = avgVelocity > 0 ? Math.sqrt(velocityVariance) / avgVelocity : 0;
    
    return Math.max(0, 1 - coefficient);
  }

  /**
   * Interpolate between two stroke points
   */
  private interpolateStrokePoints(p1: StrokePoint, p2: StrokePoint, t: number): StrokePoint {
    return {
      position: p1.position.lerp(p2.position, t),
      worldPosition: p1.worldPosition.lerp(p2.worldPosition, t),
      timestamp: p1.timestamp + (p2.timestamp - p1.timestamp) * t,
      pressure: p1.pressure + (p2.pressure - p1.pressure) * t,
      tiltX: p1.tiltX + (p2.tiltX - p1.tiltX) * t,
      tiltY: p1.tiltY + (p2.tiltY - p1.tiltY) * t,
      velocity: p1.velocity.lerp(p2.velocity, t)
    };
  }

  /**
   * Generate unique stroke ID
   */
  private generateStrokeId(): string {
    return `stroke_${++this.strokeIdCounter}_${Date.now()}`;
  }

  /**
   * Recycle stroke points for memory efficiency
   */
  private recyclePoints(points: StrokePoint[]): void {
    // Simple recycling - in production, might implement more sophisticated pooling
    this.pointPool.push(...points);
    
    // Limit pool size to prevent memory leaks
    if (this.pointPool.length > 1000) {
      this.pointPool.length = 500;
    }
  }
}