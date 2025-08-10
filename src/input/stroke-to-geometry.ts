import { Vec2 } from '../core/math/vec2.js';
import { LineSegment } from '../core/geometry/line-segment.js';
import { ArcSegment } from '../core/geometry/arc-segment.js';
import { Segment } from '../core/geometry/segment.js';
import { ProcessedStroke, StrokePoint } from './stroke-processor.js';
import { CornerDetector, CornerDetectionResult } from './corner-detector.js';

/**
 * Stroke-to-geometry conversion system for Zotebook.
 * Converts processed strokes into precise geometric segments (lines, arcs, curves).
 * Based on sophisticated curve fitting algorithms used in the original Zotebook.
 */

export enum GeometryType {
  LINE = 'line',
  ARC = 'arc',
  CIRCLE = 'circle',
  SPLINE = 'spline',
  UNKNOWN = 'unknown'
}

export interface GeometryFitResult {
  readonly segment: Segment;
  readonly type: GeometryType;
  readonly confidence: number;    // 0.0-1.0, higher is better fit
  readonly error: number;         // RMS error in pixels
  readonly points: ReadonlyArray<Vec2>; // Original points used for fitting
  readonly metadata: {
    readonly method: string;
    readonly iterations?: number;
    readonly parameters?: Record<string, number>;
  };
}

export interface ConversionOptions {
  readonly lineThreshold: number;        // Maximum error for line fitting (pixels)
  readonly arcThreshold: number;         // Maximum error for arc fitting (pixels)
  readonly circleThreshold: number;      // Maximum error for circle fitting (pixels)
  readonly minSegmentLength: number;     // Minimum segment length (pixels)
  readonly enableCircleDetection: boolean;
  readonly enableSplineGeneration: boolean;
  readonly maxFittingIterations: number;
  readonly confidenceThreshold: number;  // Minimum confidence to accept fit
}

const DEFAULT_CONVERSION_OPTIONS: ConversionOptions = {
  lineThreshold: 3.0,
  arcThreshold: 5.0,
  circleThreshold: 8.0,
  minSegmentLength: 20.0,
  enableCircleDetection: true,
  enableSplineGeneration: false, // Not implemented yet
  maxFittingIterations: 50,
  confidenceThreshold: 0.6
};

/**
 * Converts processed strokes into geometric segments using various fitting algorithms.
 */
export class StrokeToGeometryConverter {
  private options: ConversionOptions;
  private cornerDetector: CornerDetector;

  constructor(options: Partial<ConversionOptions> = {}) {
    this.options = { ...DEFAULT_CONVERSION_OPTIONS, ...options };
    this.cornerDetector = new CornerDetector();
  }

  /**
   * Convert a processed stroke into geometric segments
   */
  convertStroke(stroke: ProcessedStroke): GeometryFitResult[] {
    const results: GeometryFitResult[] = [];
    
    // Use the stroke's processed points for conversion
    const points = stroke.resampledPoints.map(p => p.position);
    
    if (points.length < 2) {
      return results;
    }

    // Detect additional corners if needed (supplement stroke processing)
    const cornerResult = this.cornerDetector.detectCorners(points);
    const corners = this.mergeCornerDetection(stroke.cornerIndices, cornerResult.cornerIndices);
    
    // Process each segment between corners
    let segmentStart = 0;
    
    for (const cornerIndex of corners) {
      if (cornerIndex > segmentStart) {
        const segmentPoints = points.slice(segmentStart, cornerIndex + 1);
        const segmentResult = this.fitSegment(segmentPoints);
        
        if (segmentResult && segmentResult.confidence >= this.options.confidenceThreshold) {
          results.push(segmentResult);
        }
      }
      segmentStart = cornerIndex;
    }
    
    // Process final segment
    if (segmentStart < points.length - 1) {
      const segmentPoints = points.slice(segmentStart);
      const segmentResult = this.fitSegment(segmentPoints);
      
      if (segmentResult && segmentResult.confidence >= this.options.confidenceThreshold) {
        results.push(segmentResult);
      }
    }
    
    // Post-process results
    return this.postProcessResults(results);
  }

  /**
   * Fit a single segment using multiple geometric primitives
   */
  private fitSegment(points: Vec2[]): GeometryFitResult | null {
    if (points.length < 2) return null;
    
    if (this.isSegmentTooShort(points)) {
      return null;
    }
    
    // Try fitting different geometric primitives in order of complexity
    const fittingResults: GeometryFitResult[] = [];
    
    // 1. Try line fitting (simplest)
    const lineFit = this.fitLine(points);
    if (lineFit) fittingResults.push(lineFit);
    
    // 2. Try circle fitting (if enabled and enough points)
    if (this.options.enableCircleDetection && points.length >= 5) {
      const circleFit = this.fitCircle(points);
      if (circleFit) fittingResults.push(circleFit);
    }
    
    // 3. Try arc fitting
    if (points.length >= 3) {
      const arcFit = this.fitArc(points);
      if (arcFit) fittingResults.push(arcFit);
    }
    
    // Choose the best fit based on confidence and error
    if (fittingResults.length === 0) return null;
    
    return this.selectBestFit(fittingResults);
  }

  /**
   * Fit a line to the given points using least squares
   */
  private fitLine(points: Vec2[]): GeometryFitResult | null {
    if (points.length < 2) return null;
    
    // Simple case: use first and last points
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    
    const segment = new LineSegment(startPoint, endPoint);
    
    // Calculate RMS error
    const error = this.calculateLineError(points, segment);
    
    // Calculate confidence based on error and linearity
    let confidence = 1.0;
    if (error > this.options.lineThreshold) {
      confidence = Math.max(0, 1 - (error - this.options.lineThreshold) / this.options.lineThreshold);
    }
    
    // Boost confidence for very straight lines
    const linearity = this.calculateLinearity(points);
    confidence *= linearity;
    
    return {
      segment,
      type: GeometryType.LINE,
      confidence,
      error,
      points,
      metadata: {
        method: 'least_squares_endpoints',
        parameters: {
          linearity
        }
      }
    };
  }

  /**
   * Fit an arc to the given points
   */
  private fitArc(points: Vec2[]): GeometryFitResult | null {
    if (points.length < 3) return null;
    
    // Use three-point method: start, middle, end
    const startPoint = points[0];
    const middleIndex = Math.floor(points.length / 2);
    const middlePoint = points[middleIndex];
    const endPoint = points[points.length - 1];
    
    try {
      // Try to create arc from three points
      const segment = ArcSegment.fromThreePoints(startPoint, middlePoint, endPoint);
      
      // Calculate error
      const error = this.calculateArcError(points, segment);
      
      // Calculate confidence
      let confidence = 1.0;
      if (error > this.options.arcThreshold) {
        confidence = Math.max(0, 1 - (error - this.options.arcThreshold) / this.options.arcThreshold);
      }
      
      // Boost confidence for consistent curvature
      const curvatureConsistency = this.calculateCurvatureConsistency(points);
      confidence *= curvatureConsistency;
      
      return {
        segment,
        type: GeometryType.ARC,
        confidence,
        error,
        points,
        metadata: {
          method: 'three_point_fit',
          parameters: {
            radius: segment.radius,
            curvatureConsistency
          }
        }
      };
    } catch (error) {
      // Arc fitting failed (points might be collinear)
      return null;
    }
  }

  /**
   * Fit a circle to the given points
   */
  private fitCircle(points: Vec2[]): GeometryFitResult | null {
    if (points.length < 5) return null;
    
    // Check if points form a closed shape
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const closureDistance = startPoint.distanceTo(endPoint);
    const averageSpacing = this.calculateAverageSpacing(points);
    
    if (closureDistance > averageSpacing * 3) {
      // Not a closed shape, unlikely to be a circle
      return null;
    }
    
    // Fit circle using least squares
    const circleResult = this.fitCircleLeastSquares(points);
    if (!circleResult) return null;
    
    const { center, radius } = circleResult;
    
    // Create full circle segment
    const segment = new ArcSegment(center, radius, 0, Math.PI * 2);
    
    // Calculate error
    const error = this.calculateCircleError(points, center, radius);
    
    // Calculate confidence
    let confidence = 1.0;
    if (error > this.options.circleThreshold) {
      confidence = Math.max(0, 1 - (error - this.options.circleThreshold) / this.options.circleThreshold);
    }
    
    // Boost confidence for good closure and consistent radius
    const closureQuality = 1 - Math.min(1, closureDistance / (averageSpacing * 3));
    const radiusConsistency = this.calculateRadiusConsistency(points, center, radius);
    confidence *= closureQuality * radiusConsistency;
    
    return {
      segment,
      type: GeometryType.CIRCLE,
      confidence,
      error,
      points,
      metadata: {
        method: 'least_squares_circle',
        parameters: {
          radius,
          closureQuality,
          radiusConsistency
        }
      }
    };
  }

  /**
   * Calculate RMS error for line fit
   */
  private calculateLineError(points: Vec2[], line: LineSegment): number {
    let sumSquaredError = 0;
    
    for (const point of points) {
      const distance = line.distanceToPoint(point);
      sumSquaredError += distance * distance;
    }
    
    return Math.sqrt(sumSquaredError / points.length);
  }

  /**
   * Calculate RMS error for arc fit
   */
  private calculateArcError(points: Vec2[], arc: ArcSegment): number {
    let sumSquaredError = 0;
    
    for (const point of points) {
      const distance = arc.distanceToPoint(point);
      sumSquaredError += distance * distance;
    }
    
    return Math.sqrt(sumSquaredError / points.length);
  }

  /**
   * Calculate RMS error for circle fit
   */
  private calculateCircleError(points: Vec2[], center: Vec2, radius: number): number {
    let sumSquaredError = 0;
    
    for (const point of points) {
      const distance = Math.abs(point.distanceTo(center) - radius);
      sumSquaredError += distance * distance;
    }
    
    return Math.sqrt(sumSquaredError / points.length);
  }

  /**
   * Calculate linearity score (how straight the points are)
   */
  private calculateLinearity(points: Vec2[]): number {
    if (points.length < 3) return 1.0;
    
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const totalDistance = startPoint.distanceTo(endPoint);
    
    if (totalDistance < 1e-6) return 1.0;
    
    let maxDeviation = 0;
    
    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      const deviation = this.pointToLineDistance(point, startPoint, endPoint);
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    
    const deviationRatio = maxDeviation / totalDistance;
    return Math.max(0, 1 - deviationRatio * 5); // Scale factor
  }

  /**
   * Calculate curvature consistency
   */
  private calculateCurvatureConsistency(points: Vec2[]): number {
    if (points.length < 5) return 1.0;
    
    const curvatures: number[] = [];
    
    // Calculate curvature at several points
    for (let i = 2; i < points.length - 2; i++) {
      const p1 = points[i - 2];
      const p2 = points[i];
      const p3 = points[i + 2];
      
      const curvature = this.calculateCurvature(p1, p2, p3);
      curvatures.push(curvature);
    }
    
    if (curvatures.length === 0) return 1.0;
    
    // Calculate coefficient of variation
    const mean = curvatures.reduce((a, b) => a + b, 0) / curvatures.length;
    const variance = curvatures.reduce((sum, c) => sum + (c - mean) * (c - mean), 0) / curvatures.length;
    const stdDev = Math.sqrt(variance);
    
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 0;
    
    return Math.max(0, 1 - coefficientOfVariation);
  }

  /**
   * Calculate radius consistency for circle fitting
   */
  private calculateRadiusConsistency(points: Vec2[], center: Vec2, targetRadius: number): number {
    const radii = points.map(p => p.distanceTo(center));
    
    let sumSquaredError = 0;
    for (const radius of radii) {
      const error = Math.abs(radius - targetRadius);
      sumSquaredError += error * error;
    }
    
    const rmsError = Math.sqrt(sumSquaredError / radii.length);
    const relativeError = targetRadius > 0 ? rmsError / targetRadius : 1;
    
    return Math.max(0, 1 - relativeError * 2);
  }

  /**
   * Fit circle using least squares method
   */
  private fitCircleLeastSquares(points: Vec2[]): { center: Vec2; radius: number } | null {
    if (points.length < 3) return null;
    
    // Use algebraic circle fitting (Pratt method)
    let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
    let sumXXX = 0, sumYYY = 0, sumXXY = 0, sumXYY = 0;
    
    const n = points.length;
    
    for (const point of points) {
      const x = point.x;
      const y = point.y;
      const xx = x * x;
      const yy = y * y;
      
      sumX += x;
      sumY += y;
      sumXX += xx;
      sumYY += yy;
      sumXY += x * y;
      sumXXX += xx * x;
      sumYYY += yy * y;
      sumXXY += xx * y;
      sumXYY += x * yy;
    }
    
    // Solve the linear system for circle parameters
    const A = n * sumXX - sumX * sumX;
    const B = n * sumXY - sumX * sumY;
    const C = n * sumYY - sumY * sumY;
    const D = 0.5 * (n * sumXXY - sumX * sumXY + n * sumYYY - sumY * sumYY);
    const E = 0.5 * (n * sumXXX - sumX * sumXX + n * sumXYY - sumY * sumXY);
    
    const denominator = A * C - B * B;
    if (Math.abs(denominator) < 1e-10) return null;
    
    const centerX = (D * C - B * E) / denominator;
    const centerY = (A * E - B * D) / denominator;
    
    // Calculate radius
    let sumRadiusSquared = 0;
    const center = new Vec2(centerX, centerY);
    
    for (const point of points) {
      const radiusSquared = point.distanceToSquared(center);
      sumRadiusSquared += radiusSquared;
    }
    
    const radius = Math.sqrt(sumRadiusSquared / n);
    
    return { center, radius };
  }

  /**
   * Calculate curvature at a point using three points
   */
  private calculateCurvature(p1: Vec2, p2: Vec2, p3: Vec2): number {
    const a = p1.distanceTo(p2);
    const b = p2.distanceTo(p3);
    const c = p3.distanceTo(p1);
    
    const area = Math.abs(p2.subtract(p1).cross(p3.subtract(p1))) / 2;
    
    if (area < 1e-10 || a * b * c < 1e-10) return 0;
    
    return (4 * area) / (a * b * c);
  }

  /**
   * Calculate distance from point to line
   */
  private pointToLineDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
    const lineVector = lineEnd.subtract(lineStart);
    const pointVector = point.subtract(lineStart);
    
    if (lineVector.lengthSquared < 1e-10) {
      return pointVector.length;
    }
    
    const cross = pointVector.cross(lineVector);
    return Math.abs(cross) / lineVector.length;
  }

  /**
   * Calculate average spacing between consecutive points
   */
  private calculateAverageSpacing(points: Vec2[]): number {
    if (points.length < 2) return 0;
    
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += points[i - 1].distanceTo(points[i]);
    }
    
    return totalDistance / (points.length - 1);
  }

  /**
   * Check if segment is too short to process
   */
  private isSegmentTooShort(points: Vec2[]): boolean {
    if (points.length < 2) return true;
    
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const distance = startPoint.distanceTo(endPoint);
    
    return distance < this.options.minSegmentLength;
  }

  /**
   * Merge corner detection results
   */
  private mergeCornerDetection(strokeCorners: ReadonlyArray<number>, detectedCorners: ReadonlyArray<number>): number[] {
    const merged = new Set([...strokeCorners, ...detectedCorners]);
    return Array.from(merged).sort((a, b) => a - b);
  }

  /**
   * Select the best fitting result from multiple candidates
   */
  private selectBestFit(results: GeometryFitResult[]): GeometryFitResult {
    if (results.length === 1) return results[0];
    
    // Score each result based on confidence, error, and complexity preference
    let bestResult = results[0];
    let bestScore = this.calculateFitScore(bestResult);
    
    for (let i = 1; i < results.length; i++) {
      const result = results[i];
      const score = this.calculateFitScore(result);
      
      if (score > bestScore) {
        bestScore = score;
        bestResult = result;
      }
    }
    
    return bestResult;
  }

  /**
   * Calculate overall score for a fit result
   */
  private calculateFitScore(result: GeometryFitResult): number {
    let score = result.confidence;
    
    // Prefer simpler geometries when confidence is similar
    const complexityBonus = {
      [GeometryType.LINE]: 0.1,
      [GeometryType.ARC]: 0.05,
      [GeometryType.CIRCLE]: 0.0,
      [GeometryType.SPLINE]: -0.05,
      [GeometryType.UNKNOWN]: -0.1
    };
    
    score += complexityBonus[result.type] || 0;
    
    // Penalize high error
    const errorPenalty = Math.min(0.2, result.error / 10);
    score -= errorPenalty;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Post-process results to clean up and optimize
   */
  private postProcessResults(results: GeometryFitResult[]): GeometryFitResult[] {
    if (results.length === 0) return results;
    
    // For now, just return results as-is
    // Could add segment merging, gap filling, etc.
    return results;
  }

  /**
   * Update conversion options
   */
  updateOptions(newOptions: Partial<ConversionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }
}

/**
 * Utility functions for stroke-to-geometry conversion analysis
 */
export namespace StrokeToGeometryUtils {
  /**
   * Visualize geometry fitting results
   */
  export function visualizeResults(
    originalPoints: Vec2[],
    results: GeometryFitResult[],
    canvas?: HTMLCanvasElement
  ): HTMLCanvasElement {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
    }
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw original stroke
    ctx.beginPath();
    ctx.strokeStyle = '#ccc';
    ctx.lineWidth = 1;
    for (let i = 0; i < originalPoints.length; i++) {
      const point = originalPoints[i];
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
    
    // Draw fitted segments
    const colors = ['red', 'blue', 'green', 'orange', 'purple'];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const color = colors[i % colors.length];
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      
      if (result.type === GeometryType.LINE) {
        const line = result.segment as LineSegment;
        ctx.beginPath();
        ctx.moveTo(line.startPoint.x, line.startPoint.y);
        ctx.lineTo(line.endPoint.x, line.endPoint.y);
        ctx.stroke();
      } else if (result.type === GeometryType.ARC || result.type === GeometryType.CIRCLE) {
        const arc = result.segment as ArcSegment;
        const points = arc.samplePoints(50);
        
        ctx.beginPath();
        for (let j = 0; j < points.length; j++) {
          const point = points[j];
          if (j === 0) {
            ctx.moveTo(point.x, point.y);
          } else {
            ctx.lineTo(point.x, point.y);
          }
        }
        ctx.stroke();
      }
    }
    
    return canvas;
  }

  /**
   * Calculate conversion quality metrics
   */
  export function calculateConversionMetrics(
    originalPoints: Vec2[],
    results: GeometryFitResult[]
  ): {
    overallError: number;
    averageConfidence: number;
    compressionRatio: number;
    typeDistribution: Record<GeometryType, number>;
  } {
    let totalError = 0;
    let totalConfidence = 0;
    let totalOriginalPoints = originalPoints.length;
    let totalSegments = results.length;
    
    const typeDistribution: Record<GeometryType, number> = {
      [GeometryType.LINE]: 0,
      [GeometryType.ARC]: 0,
      [GeometryType.CIRCLE]: 0,
      [GeometryType.SPLINE]: 0,
      [GeometryType.UNKNOWN]: 0
    };
    
    for (const result of results) {
      totalError += result.error;
      totalConfidence += result.confidence;
      typeDistribution[result.type]++;
    }
    
    return {
      overallError: results.length > 0 ? totalError / results.length : 0,
      averageConfidence: results.length > 0 ? totalConfidence / results.length : 0,
      compressionRatio: totalOriginalPoints > 0 ? totalSegments / totalOriginalPoints : 0,
      typeDistribution
    };
  }
}