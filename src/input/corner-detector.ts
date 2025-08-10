import { Vec2 } from '../core/math/vec2.js';

/**
 * Advanced corner detection algorithm for stroke segmentation.
 * Based on curvature analysis and direction change detection.
 * Implements sophisticated algorithms from geometric processing research.
 */

export interface CornerDetectionResult {
  readonly cornerIndices: ReadonlyArray<number>;
  readonly curvatures: ReadonlyArray<number>;
  readonly confidence: ReadonlyArray<number>; // 0.0-1.0 confidence for each corner
  readonly segments: ReadonlyArray<{
    startIndex: number;
    endIndex: number;
    type: 'line' | 'curve';
    quality: number;
  }>;
}

export interface CornerDetectionOptions {
  readonly curvatureThreshold: number;    // Minimum curvature for corner detection
  readonly minSegmentLength: number;      // Minimum pixels between corners
  readonly smoothingWindow: number;       // Window size for curvature smoothing
  readonly confidenceThreshold: number;   // Minimum confidence to accept corner
  readonly adaptiveThreshold: boolean;    // Use adaptive thresholding
  readonly filterNearbyCorners: boolean;  // Remove corners too close together
}

const DEFAULT_CORNER_OPTIONS: CornerDetectionOptions = {
  curvatureThreshold: 0.8,      // ~46 degrees
  minSegmentLength: 15,         // 15 pixels minimum
  smoothingWindow: 5,           // 5-point smoothing
  confidenceThreshold: 0.6,     // 60% confidence minimum
  adaptiveThreshold: true,
  filterNearbyCorners: true
};

/**
 * Sophisticated corner detector using multiple curvature estimation methods.
 * Provides reliable corner detection for various stroke types and drawing speeds.
 */
export class CornerDetector {
  private options: CornerDetectionOptions;

  constructor(options: Partial<CornerDetectionOptions> = {}) {
    this.options = { ...DEFAULT_CORNER_OPTIONS, ...options };
  }

  /**
   * Detect corners in a sequence of points
   */
  detectCorners(points: Vec2[]): CornerDetectionResult {
    if (points.length < 3) {
      return {
        cornerIndices: [],
        curvatures: [],
        confidence: [],
        segments: points.length >= 2 ? [{ startIndex: 0, endIndex: points.length - 1, type: 'line', quality: 1.0 }] : []
      };
    }

    // Step 1: Calculate curvature at each point using multiple methods
    const curvatures = this.calculateCurvatures(points);
    
    // Step 2: Smooth curvatures to reduce noise
    const smoothedCurvatures = this.smoothCurvatures(curvatures);
    
    // Step 3: Find corner candidates using various criteria
    const candidates = this.findCornerCandidates(points, smoothedCurvatures);
    
    // Step 4: Filter and refine corners
    const refinedCorners = this.refineCorners(points, candidates);
    
    // Step 5: Calculate confidence scores
    const confidenceScores = this.calculateConfidenceScores(points, smoothedCurvatures, refinedCorners);
    
    // Step 6: Generate segments between corners
    const segments = this.generateSegments(points, refinedCorners);
    
    return {
      cornerIndices: refinedCorners,
      curvatures: smoothedCurvatures,
      confidence: confidenceScores,
      segments
    };
  }

  /**
   * Update detection options
   */
  updateOptions(newOptions: Partial<CornerDetectionOptions>): void {
    this.options = { ...this.options, ...newOptions };
  }

  /**
   * Calculate curvature at each point using the circumcircle method
   */
  private calculateCurvatures(points: Vec2[]): number[] {
    const curvatures: number[] = new Array(points.length).fill(0);
    const windowSize = this.options.smoothingWindow;
    
    for (let i = 0; i < points.length; i++) {
      if (i < windowSize || i >= points.length - windowSize) {
        curvatures[i] = 0; // No curvature at endpoints
        continue;
      }
      
      // Use three points to calculate curvature
      const p1 = points[i - windowSize];
      const p2 = points[i];
      const p3 = points[i + windowSize];
      
      curvatures[i] = this.calculateCircumcircleCurvature(p1, p2, p3);
    }
    
    return curvatures;
  }

  /**
   * Calculate curvature using circumcircle method
   */
  private calculateCircumcircleCurvature(p1: Vec2, p2: Vec2, p3: Vec2): number {
    // Calculate side lengths
    const a = p2.distanceTo(p3);
    const b = p1.distanceTo(p3);
    const c = p1.distanceTo(p2);
    
    // Calculate area using cross product
    const crossProduct = p2.subtract(p1).cross(p3.subtract(p1));
    const area = Math.abs(crossProduct) / 2;
    
    // Handle degenerate cases
    if (area < 1e-10 || a * b * c < 1e-10) {
      return 0;
    }
    
    // Curvature = 4 * Area / (a * b * c)
    // This gives us the reciprocal of the circumradius
    return (4 * area) / (a * b * c);
  }

  /**
   * Alternative curvature calculation using angle method
   */
  private calculateAngleCurvature(points: Vec2[], index: number, windowSize: number): number {
    if (index < windowSize || index >= points.length - windowSize) {
      return 0;
    }
    
    const p1 = points[index - windowSize];
    const p2 = points[index];
    const p3 = points[index + windowSize];
    
    const v1 = p2.subtract(p1).normalized;
    const v2 = p3.subtract(p2).normalized;
    
    // Calculate angle between vectors
    const dot = Math.max(-1, Math.min(1, v1.dot(v2)));
    const angle = Math.acos(dot);
    
    // Convert angle to curvature (higher angle = higher curvature)
    return Math.PI - angle;
  }

  /**
   * Smooth curvature values to reduce noise
   */
  private smoothCurvatures(curvatures: number[]): number[] {
    if (curvatures.length < 3) return [...curvatures];
    
    const smoothed = [...curvatures];
    const kernel = this.createGaussianKernel(this.options.smoothingWindow);
    const halfWindow = Math.floor(this.options.smoothingWindow / 2);
    
    for (let i = halfWindow; i < curvatures.length - halfWindow; i++) {
      let sum = 0;
      let weightSum = 0;
      
      for (let j = -halfWindow; j <= halfWindow; j++) {
        const weight = kernel[j + halfWindow];
        sum += curvatures[i + j] * weight;
        weightSum += weight;
      }
      
      smoothed[i] = weightSum > 0 ? sum / weightSum : curvatures[i];
    }
    
    return smoothed;
  }

  /**
   * Create Gaussian smoothing kernel
   */
  private createGaussianKernel(size: number): number[] {
    const kernel: number[] = new Array(size);
    const sigma = size / 6; // Standard deviation
    const center = Math.floor(size / 2);
    
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const x = i - center;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }
    
    // Normalize kernel
    for (let i = 0; i < size; i++) {
      kernel[i] /= sum;
    }
    
    return kernel;
  }

  /**
   * Find corner candidates using threshold-based detection
   */
  private findCornerCandidates(points: Vec2[], curvatures: number[]): number[] {
    const candidates: number[] = [];
    const threshold = this.options.adaptiveThreshold 
      ? this.calculateAdaptiveThreshold(curvatures)
      : this.options.curvatureThreshold;
    
    // Find local maxima in curvature that exceed threshold
    for (let i = 1; i < curvatures.length - 1; i++) {
      const curvature = curvatures[i];
      
      if (curvature > threshold &&
          curvature > curvatures[i - 1] &&
          curvature > curvatures[i + 1] &&
          this.isValidCornerPosition(points, candidates, i)) {
        candidates.push(i);
      }
    }
    
    return candidates;
  }

  /**
   * Calculate adaptive threshold based on curvature distribution
   */
  private calculateAdaptiveThreshold(curvatures: number[]): number {
    if (curvatures.length === 0) return this.options.curvatureThreshold;
    
    // Calculate statistics
    const sortedCurvatures = [...curvatures].sort((a, b) => a - b);
    const median = sortedCurvatures[Math.floor(sortedCurvatures.length / 2)];
    const q75 = sortedCurvatures[Math.floor(sortedCurvatures.length * 0.75)];
    const max = sortedCurvatures[sortedCurvatures.length - 1];
    
    // Use percentile-based threshold
    const adaptiveThreshold = Math.max(
      median + (q75 - median) * 2, // 2x IQR above median
      max * 0.3,                   // 30% of maximum
      this.options.curvatureThreshold // Minimum threshold
    );
    
    return adaptiveThreshold;
  }

  /**
   * Check if a corner position is valid (not too close to existing corners)
   */
  private isValidCornerPosition(points: Vec2[], existingCorners: number[], candidateIndex: number): boolean {
    const minDistance = this.options.minSegmentLength;
    
    for (const cornerIndex of existingCorners) {
      const distance = points[candidateIndex].distanceTo(points[cornerIndex]);
      if (distance < minDistance) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Refine corner positions and filter out false positives
   */
  private refineCorners(points: Vec2[], candidates: number[]): number[] {
    let refined = [...candidates];
    
    if (this.options.filterNearbyCorners) {
      refined = this.filterNearbyCorners(points, refined);
    }
    
    // Refine corner positions to local maxima
    refined = refined.map(index => this.refineCornerPosition(points, index));
    
    // Remove duplicates and sort
    refined = [...new Set(refined)].sort((a, b) => a - b);
    
    return refined;
  }

  /**
   * Filter out corners that are too close together
   */
  private filterNearbyCorners(points: Vec2[], corners: number[]): number[] {
    if (corners.length <= 1) return corners;
    
    const filtered: number[] = [corners[0]];
    const minDistance = this.options.minSegmentLength;
    
    for (let i = 1; i < corners.length; i++) {
      const currentCorner = corners[i];
      let keepCorner = true;
      
      // Check distance to all accepted corners
      for (const acceptedCorner of filtered) {
        const distance = points[currentCorner].distanceTo(points[acceptedCorner]);
        if (distance < minDistance) {
          keepCorner = false;
          break;
        }
      }
      
      if (keepCorner) {
        filtered.push(currentCorner);
      }
    }
    
    return filtered;
  }

  /**
   * Refine corner position to local maximum
   */
  private refineCornerPosition(points: Vec2[], initialIndex: number): number {
    const searchRadius = 3;
    let bestIndex = initialIndex;
    let bestCurvature = 0;
    
    const start = Math.max(0, initialIndex - searchRadius);
    const end = Math.min(points.length - 1, initialIndex + searchRadius);
    
    for (let i = start; i <= end; i++) {
      const curvature = this.calculateCircumcircleCurvature(
        points[Math.max(0, i - 2)],
        points[i],
        points[Math.min(points.length - 1, i + 2)]
      );
      
      if (curvature > bestCurvature) {
        bestCurvature = curvature;
        bestIndex = i;
      }
    }
    
    return bestIndex;
  }

  /**
   * Calculate confidence scores for detected corners
   */
  private calculateConfidenceScores(points: Vec2[], curvatures: number[], corners: number[]): number[] {
    const confidenceScores: number[] = new Array(corners.length);
    
    for (let i = 0; i < corners.length; i++) {
      const cornerIndex = corners[i];
      confidenceScores[i] = this.calculateCornerConfidence(points, curvatures, cornerIndex);
    }
    
    return confidenceScores;
  }

  /**
   * Calculate confidence score for a single corner
   */
  private calculateCornerConfidence(points: Vec2[], curvatures: number[], cornerIndex: number): number {
    if (cornerIndex >= curvatures.length) return 0;
    
    let confidence = 1.0;
    const curvature = curvatures[cornerIndex];
    
    // Factor 1: Curvature strength (higher is better)
    const maxCurvature = Math.max(...curvatures);
    const curvatureScore = maxCurvature > 0 ? curvature / maxCurvature : 0;
    confidence *= curvatureScore;
    
    // Factor 2: Local prominence (how much it stands out from neighbors)
    const windowSize = 5;
    let localMax = curvature;
    let localAvg = curvature;
    let count = 1;
    
    for (let i = Math.max(0, cornerIndex - windowSize); 
         i <= Math.min(curvatures.length - 1, cornerIndex + windowSize); i++) {
      if (i !== cornerIndex) {
        localMax = Math.max(localMax, curvatures[i]);
        localAvg += curvatures[i];
        count++;
      }
    }
    localAvg /= count;
    
    const prominenceScore = localAvg > 0 ? curvature / localAvg : 1;
    confidence *= Math.min(1, prominenceScore / 2);
    
    // Factor 3: Consistency check using angle method
    const angleCurvature = this.calculateAngleCurvature(points, cornerIndex, 2);
    const consistencyScore = Math.min(curvature, angleCurvature) / Math.max(curvature, angleCurvature, 1e-10);
    confidence *= consistencyScore;
    
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Generate segments between detected corners
   */
  private generateSegments(points: Vec2[], corners: number[]): Array<{
    startIndex: number;
    endIndex: number;
    type: 'line' | 'curve';
    quality: number;
  }> {
    const segments: Array<{
      startIndex: number;
      endIndex: number;
      type: 'line' | 'curve';
      quality: number;
    }> = [];
    
    // Add segments between corners
    let lastIndex = 0;
    
    for (const cornerIndex of corners) {
      if (cornerIndex > lastIndex) {
        const segment = this.analyzeSegment(points, lastIndex, cornerIndex);
        segments.push(segment);
      }
      lastIndex = cornerIndex;
    }
    
    // Add final segment
    if (lastIndex < points.length - 1) {
      const segment = this.analyzeSegment(points, lastIndex, points.length - 1);
      segments.push(segment);
    }
    
    return segments;
  }

  /**
   * Analyze a segment to determine if it's a line or curve
   */
  private analyzeSegment(points: Vec2[], startIndex: number, endIndex: number): {
    startIndex: number;
    endIndex: number;
    type: 'line' | 'curve';
    quality: number;
  } {
    if (endIndex <= startIndex + 1) {
      return {
        startIndex,
        endIndex,
        type: 'line',
        quality: 1.0
      };
    }
    
    // Calculate linearity score
    const linearityScore = this.calculateLinearityScore(points, startIndex, endIndex);
    const isLine = linearityScore > 0.8; // 80% threshold for line classification
    
    return {
      startIndex,
      endIndex,
      type: isLine ? 'line' : 'curve',
      quality: isLine ? linearityScore : 1 - linearityScore
    };
  }

  /**
   * Calculate how linear a segment is (0 = very curved, 1 = perfectly straight)
   */
  private calculateLinearityScore(points: Vec2[], startIndex: number, endIndex: number): number {
    if (endIndex <= startIndex + 1) return 1.0;
    
    const startPoint = points[startIndex];
    const endPoint = points[endIndex];
    const totalDistance = startPoint.distanceTo(endPoint);
    
    if (totalDistance < 1e-6) return 1.0; // Degenerate case
    
    // Calculate maximum deviation from straight line
    let maxDeviation = 0;
    
    for (let i = startIndex + 1; i < endIndex; i++) {
      const point = points[i];
      const deviation = this.pointToLineDistance(point, startPoint, endPoint);
      maxDeviation = Math.max(maxDeviation, deviation);
    }
    
    // Convert deviation to linearity score
    const deviationRatio = maxDeviation / totalDistance;
    return Math.max(0, 1 - deviationRatio * 10); // Scale factor of 10
  }

  /**
   * Calculate distance from point to line
   */
  private pointToLineDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
    const lineVector = lineEnd.subtract(lineStart);
    const pointVector = point.subtract(lineStart);
    
    if (lineVector.lengthSquared < 1e-10) {
      return pointVector.length; // Degenerate line
    }
    
    const cross = pointVector.cross(lineVector);
    return Math.abs(cross) / lineVector.length;
  }
}

/**
 * Utility functions for corner detection analysis
 */
export namespace CornerDetectionUtils {
  /**
   * Visualize corner detection results (for debugging)
   */
  export function visualizeCorners(
    points: Vec2[],
    result: CornerDetectionResult,
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
    
    // Draw stroke
    ctx.beginPath();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      if (i === 0) {
        ctx.moveTo(point.x, point.y);
      } else {
        ctx.lineTo(point.x, point.y);
      }
    }
    ctx.stroke();
    
    // Draw corners
    ctx.fillStyle = 'red';
    for (let i = 0; i < result.cornerIndices.length; i++) {
      const cornerIndex = result.cornerIndices[i];
      const point = points[cornerIndex];
      const confidence = result.confidence[i];
      
      ctx.beginPath();
      ctx.arc(point.x, point.y, 5 * confidence + 2, 0, Math.PI * 2);
      ctx.fill();
    }
    
    return canvas;
  }

  /**
   * Calculate corner detection accuracy metrics
   */
  export function calculateMetrics(
    detected: number[],
    groundTruth: number[],
    tolerance: number = 5
  ): {
    precision: number;
    recall: number;
    f1Score: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
  } {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    
    // Count true positives and false positives
    for (const detectedIndex of detected) {
      const hasMatch = groundTruth.some(gtIndex => 
        Math.abs(detectedIndex - gtIndex) <= tolerance
      );
      
      if (hasMatch) {
        truePositives++;
      } else {
        falsePositives++;
      }
    }
    
    // Count false negatives
    for (const gtIndex of groundTruth) {
      const hasMatch = detected.some(detectedIndex => 
        Math.abs(detectedIndex - gtIndex) <= tolerance
      );
      
      if (!hasMatch) {
        falseNegatives++;
      }
    }
    
    const precision = truePositives / (truePositives + falsePositives) || 0;
    const recall = truePositives / (truePositives + falseNegatives) || 0;
    const f1Score = 2 * precision * recall / (precision + recall) || 0;
    
    return {
      precision,
      recall,
      f1Score,
      truePositives,
      falsePositives,
      falseNegatives
    };
  }
}