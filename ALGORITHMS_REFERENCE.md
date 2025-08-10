# Algorithms Reference - Gesture Recognition and Constraint Solving

## Overview

This document provides detailed algorithmic specifications for implementing the core recognition and constraint solving systems that made the original Zotebook revolutionary. These algorithms must be ported to TypeScript with modern optimizations while preserving their mathematical accuracy and performance characteristics.

## Gesture Recognition Pipeline

### Multi-Stage Recognition Architecture

The original Zotebook implemented a sophisticated four-stage recognition system that processed user input with increasing sophistication over time:

```typescript
/**
 * Four-stage recognition pipeline for progressive gesture analysis
 */
export interface RecognitionPipeline {
  // Stage 1: Real-time recognition during drawing
  singleStrokeRecognition(strokePoints: Vec2[]): Promise<RecognitionResult>;
  
  // Stage 2: Enhanced recognition after pen-up
  penUpRecognition(strokeData: StrokeData): Promise<RecognitionResult>;
  
  // Stage 3: Background analysis for relationships
  deferredRecognition(model: DrawingModel): Promise<void>;
  
  // Stage 4: Dynamic recognition during manipulation
  dynamicRecognition(model: DrawingModel, changes: ModelChange[]): Promise<void>;
}

export interface RecognitionResult {
  segments: GeometricSegment[];
  confidence: ConfidenceLevel;
  constraints: RecognizedConstraint[];
  metadata: RecognitionMetadata;
}

export enum ConfidenceLevel {
  No = 0,
  Maybe = 0.5,
  Yes = 1.0
}
```

## Stroke Preprocessing Algorithms

### Corner Detection - Curvature-Based Segmentation

```typescript
/**
 * Detects corners in stroke data using curvature analysis
 * Based on the algorithm from "Accurate and Efficient Ink Analysis" (Microsoft Research)
 */
export class CornerDetector {
  private readonly curvatureThreshold = 0.8; // Radians
  private readonly minSegmentLength = 10;     // Pixels
  
  detectCorners(points: Vec2[]): number[] {
    if (points.length < 3) return [0, points.length - 1];
    
    const corners: number[] = [0]; // Always start with first point
    const curvatures = this.calculateCurvatures(points);
    
    // Find local maxima in curvature that exceed threshold
    for (let i = 2; i < points.length - 2; i++) {
      if (this.isLocalMaximum(curvatures, i) && 
          curvatures[i] > this.curvatureThreshold &&
          this.isValidSegmentLength(corners, i)) {
        corners.push(i);
      }
    }
    
    corners.push(points.length - 1); // Always end with last point
    return this.optimizeCorners(points, corners);
  }
  
  private calculateCurvatures(points: Vec2[]): number[] {
    const curvatures: number[] = [];
    const windowSize = 5; // Smoothing window
    
    for (let i = 0; i < points.length; i++) {
      if (i < windowSize || i >= points.length - windowSize) {
        curvatures[i] = 0; // No curvature at endpoints
        continue;
      }
      
      // Calculate curvature using circumcircle method
      const p1 = points[i - windowSize];
      const p2 = points[i];
      const p3 = points[i + windowSize];
      
      curvatures[i] = this.calculateCircumcircleCurvature(p1, p2, p3);
    }
    
    return this.smoothCurvatures(curvatures);
  }
  
  private calculateCircumcircleCurvature(p1: Vec2, p2: Vec2, p3: Vec2): number {
    const a = p1.distanceTo(p2);
    const b = p2.distanceTo(p3);
    const c = p3.distanceTo(p1);
    
    // Area using cross product
    const area = Math.abs(p2.subtract(p1).cross(p3.subtract(p1))) / 2;
    
    if (area < 1e-10) return 0; // Straight line
    
    // Curvature = 4 * Area / (a * b * c)
    return (4 * area) / (a * b * c);
  }
  
  private smoothCurvatures(curvatures: number[]): number[] {
    const smoothed = [...curvatures];
    const kernel = [0.1, 0.2, 0.4, 0.2, 0.1]; // Gaussian-like kernel
    
    for (let i = 2; i < curvatures.length - 2; i++) {
      let sum = 0;
      for (let j = -2; j <= 2; j++) {
        sum += curvatures[i + j] * kernel[j + 2];
      }
      smoothed[i] = sum;
    }
    
    return smoothed;
  }
}
```

### Stroke Smoothing and Resampling

```typescript
/**
 * Smooths and resamples stroke data for consistent geometric analysis
 */
export class StrokeProcessor {
  private readonly targetSpacing = 2.0; // Pixels between samples
  private readonly smoothingFactor = 0.3; // 0-1, higher = more smoothing
  
  processStroke(rawPoints: Vec2[]): Vec2[] {
    if (rawPoints.length < 2) return rawPoints;
    
    // Step 1: Remove duplicate points
    const deduplicated = this.removeDuplicates(rawPoints);
    
    // Step 2: Resample to consistent spacing
    const resampled = this.resample(deduplicated, this.targetSpacing);
    
    // Step 3: Apply smoothing filter
    const smoothed = this.smoothStroke(resampled);
    
    return smoothed;
  }
  
  private resample(points: Vec2[], spacing: number): Vec2[] {
    if (points.length < 2) return points;
    
    const resampled: Vec2[] = [points[0]];
    let currentLength = 0;
    let targetLength = spacing;
    
    for (let i = 1; i < points.length; i++) {
      const segmentLength = points[i - 1].distanceTo(points[i]);
      currentLength += segmentLength;
      
      while (currentLength >= targetLength) {
        const t = (targetLength - (currentLength - segmentLength)) / segmentLength;
        const interpolated = points[i - 1].lerp(points[i], t);
        resampled.push(interpolated);
        targetLength += spacing;
      }
    }
    
    // Always include the last point
    resampled.push(points[points.length - 1]);
    return resampled;
  }
  
  private smoothStroke(points: Vec2[]): Vec2[] {
    if (points.length < 3) return points;
    
    const smoothed: Vec2[] = [points[0]]; // Keep first point unchanged
    
    // Apply exponential smoothing
    for (let i = 1; i < points.length - 1; i++) {
      const prev = smoothed[i - 1];
      const curr = points[i];
      const next = points[i + 1];
      
      // Weighted average with neighbors
      const smoothedPoint = prev.multiply(0.25)
        .add(curr.multiply(0.5))
        .add(next.multiply(0.25));
      
      smoothed.push(smoothedPoint);
    }
    
    smoothed.push(points[points.length - 1]); // Keep last point unchanged
    return smoothed;
  }
}
```

## Geometric Segment Recognition

### Line Segment Recognition

```typescript
/**
 * Recognizes straight line segments from stroke data
 */
export class LineRecognizer {
  private readonly straightnessThreshold = 0.95; // Correlation coefficient
  private readonly maxDeviation = 3.0; // Pixels
  
  recognizeLine(points: Vec2[]): LineRecognitionResult {
    if (points.length < 2) {
      return { isLine: false, confidence: 0, segment: null };
    }
    
    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const idealDirection = endPoint.subtract(startPoint).normalized;
    
    // Calculate straightness using least squares fit
    const straightness = this.calculateStraightness(points, startPoint, idealDirection);
    
    if (straightness >= this.straightnessThreshold) {
      const confidence = Math.min(1.0, straightness);
      const segment = new LineSegment(
        Pt.fromWorld(startPoint),
        Pt.fromWorld(endPoint)
      );
      
      return { isLine: true, confidence, segment };
    }
    
    return { isLine: false, confidence: 0, segment: null };
  }
  
  private calculateStraightness(points: Vec2[], start: Vec2, direction: Vec2): number {
    let sumSquaredDeviations = 0;
    let sumSquaredDistances = 0;
    
    for (const point of points) {
      const toPoint = point.subtract(start);
      const projection = toPoint.projectedOnto(direction);
      const deviation = toPoint.subtract(projection);
      
      sumSquaredDeviations += deviation.lengthSquared;
      sumSquaredDistances += toPoint.lengthSquared;
    }
    
    if (sumSquaredDistances === 0) return 1.0;
    
    // Coefficient of determination (R²)
    return 1.0 - (sumSquaredDeviations / sumSquaredDistances);
  }
}
```

### Arc Segment Recognition

```typescript
/**
 * Recognizes circular arcs from stroke data using least squares circle fitting
 */
export class ArcRecognizer {
  private readonly circularityThreshold = 0.9;
  private readonly minArcAngle = Math.PI / 6; // 30 degrees
  
  recognizeArc(points: Vec2[]): ArcRecognitionResult {
    if (points.length < 5) {
      return { isArc: false, confidence: 0, segment: null };
    }
    
    // Fit circle using algebraic method (Pratt)
    const circle = this.fitCircle(points);
    if (!circle) {
      return { isArc: false, confidence: 0, segment: null };
    }
    
    // Calculate how well points fit the circle
    const circularity = this.calculateCircularity(points, circle);
    
    if (circularity >= this.circularityThreshold) {
      const arcSegment = this.createArcSegment(points, circle);
      const confidence = Math.min(1.0, circularity);
      
      return { isArc: true, confidence, segment: arcSegment };
    }
    
    return { isArc: false, confidence: 0, segment: null };
  }
  
  private fitCircle(points: Vec2[]): Circle | null {
    const n = points.length;
    if (n < 3) return null;
    
    // Pratt's algebraic circle fitting method
    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0;
    let sumX3 = 0, sumY3 = 0, sumXY = 0, sumXY2 = 0, sumX2Y = 0;
    
    for (const p of points) {
      const x = p.x, y = p.y;
      const x2 = x * x, y2 = y * y;
      
      sumX += x; sumY += y;
      sumX2 += x2; sumY2 += y2;
      sumX3 += x2 * x; sumY3 += y2 * y;
      sumXY += x * y;
      sumXY2 += x * y2; sumX2Y += x2 * y;
    }
    
    // Build system of equations
    const A = n * sumX2 - sumX * sumX;
    const B = n * sumXY - sumX * sumY;
    const C = n * sumY2 - sumY * sumY;
    const D = 0.5 * (n * sumXY2 - sumX * sumY2 + n * sumX3 - sumX * sumX2);
    const E = 0.5 * (n * sumX2Y - sumY * sumX2 + n * sumY3 - sumY * sumY2);
    
    const denominator = A * C - B * B;
    if (Math.abs(denominator) < 1e-10) return null;
    
    const centerX = (D * C - B * E) / denominator;
    const centerY = (A * E - B * D) / denominator;
    
    // Calculate radius
    let sumRadiusSquared = 0;
    for (const p of points) {
      const dx = p.x - centerX;
      const dy = p.y - centerY;
      sumRadiusSquared += dx * dx + dy * dy;
    }
    const radius = Math.sqrt(sumRadiusSquared / n);
    
    return {
      center: new Vec2(centerX, centerY),
      radius
    };
  }
  
  private calculateCircularity(points: Vec2[], circle: Circle): number {
    let sumSquaredDeviations = 0;
    let sumSquaredDistances = 0;
    
    const center = circle.center;
    const idealRadius = circle.radius;
    
    for (const point of points) {
      const distance = point.distanceTo(center);
      const deviation = Math.abs(distance - idealRadius);
      
      sumSquaredDeviations += deviation * deviation;
      sumSquaredDistances += distance * distance;
    }
    
    if (sumSquaredDistances === 0) return 0;
    
    return 1.0 - (sumSquaredDeviations / (sumSquaredDistances));
  }
}

interface Circle {
  center: Vec2;
  radius: number;
}
```

## Constraint Recognition Algorithms

### Parallel Line Recognition

```typescript
/**
 * Recognizes when two lines are intended to be parallel
 */
export class ParallelRecognizer {
  private readonly angleThreshold = Math.PI / 36; // 5 degrees
  private readonly confidenceBoost = 1.5; // Multiplier for strong matches
  
  recognizeParallel(newSegment: LineSegment, existingSegments: LineSegment[]): ParallelConstraint[] {
    const constraints: ParallelConstraint[] = [];
    const newDirection = newSegment.direction.normalized;
    
    for (const existing of existingSegments) {
      const existingDirection = existing.direction.normalized;
      const angle = this.calculateAngleBetween(newDirection, existingDirection);
      
      // Check for parallel (0°) or anti-parallel (180°)
      const parallelAngle = Math.min(angle, Math.PI - angle);
      
      if (parallelAngle <= this.angleThreshold) {
        const confidence = this.calculateConfidence(parallelAngle, newSegment, existing);
        
        constraints.push(new ParallelConstraint(newSegment, existing, confidence));
      }
    }
    
    return constraints.sort((a, b) => b.confidence - a.confidence);
  }
  
  private calculateAngleBetween(dir1: Vec2, dir2: Vec2): number {
    const dot = Math.max(-1, Math.min(1, dir1.dot(dir2)));
    return Math.acos(Math.abs(dot));
  }
  
  private calculateConfidence(angle: number, seg1: LineSegment, seg2: LineSegment): number {
    // Base confidence from angle accuracy
    let confidence = 1.0 - (angle / this.angleThreshold);
    
    // Boost confidence for similar lengths
    const lengthRatio = Math.min(seg1.length, seg2.length) / Math.max(seg1.length, seg2.length);
    confidence *= (0.5 + 0.5 * lengthRatio);
    
    // Boost confidence for nearby segments
    const distance = this.calculateSegmentDistance(seg1, seg2);
    if (distance < 50) { // Within 50 pixels
      confidence *= this.confidenceBoost;
    }
    
    return Math.min(1.0, confidence);
  }
  
  private calculateSegmentDistance(seg1: LineSegment, seg2: LineSegment): number {
    // Calculate minimum distance between two line segments
    const distances = [
      seg1.startPoint.distanceTo(seg2.startPoint),
      seg1.startPoint.distanceTo(seg2.endPoint),
      seg1.endPoint.distanceTo(seg2.startPoint),
      seg1.endPoint.distanceTo(seg2.endPoint)
    ];
    
    return Math.min(...distances);
  }
}
```

### Equal Length Recognition

```typescript
/**
 * Recognizes when segments are intended to have equal length
 */
export class EqualLengthRecognizer {
  private readonly lengthTolerancePercent = 0.1; // 10% tolerance
  private readonly absoluteTolerance = 2.0; // 2 pixels minimum
  
  recognizeEqualLength(newSegment: GeometricSegment, existingSegments: GeometricSegment[]): EqualLengthConstraint[] {
    const constraints: EqualLengthConstraint[] = [];
    const newLength = newSegment.length;
    
    for (const existing of existingSegments) {
      const existingLength = existing.length;
      
      if (this.areLengthsEqual(newLength, existingLength)) {
        const confidence = this.calculateLengthConfidence(newLength, existingLength);
        constraints.push(new EqualLengthConstraint(newSegment, existing, confidence));
      }
    }
    
    return constraints.sort((a, b) => b.confidence - a.confidence);
  }
  
  private areLengthsEqual(length1: number, length2: number): boolean {
    const maxLength = Math.max(length1, length2);
    const difference = Math.abs(length1 - length2);
    
    // Use relative tolerance for larger lengths, absolute for smaller
    const tolerance = Math.max(
      this.absoluteTolerance,
      maxLength * this.lengthTolerancePercent
    );
    
    return difference <= tolerance;
  }
  
  private calculateLengthConfidence(length1: number, length2: number): number {
    const maxLength = Math.max(length1, length2);
    const difference = Math.abs(length1 - length2);
    const tolerance = Math.max(this.absoluteTolerance, maxLength * this.lengthTolerancePercent);
    
    return Math.max(0, 1.0 - (difference / tolerance));
  }
}
```

### Right Angle Recognition

```typescript
/**
 * Recognizes perpendicular relationships between line segments
 */
export class RightAngleRecognizer {
  private readonly angleThreshold = Math.PI / 36; // 5 degrees
  private readonly rightAngle = Math.PI / 2;
  
  recognizeRightAngle(newSegment: LineSegment, existingSegments: LineSegment[]): RightAngleConstraint[] {
    const constraints: RightAngleConstraint[] = [];
    const newDirection = newSegment.direction.normalized;
    
    for (const existing of existingSegments) {
      const existingDirection = existing.direction.normalized;
      const angle = Math.abs(newDirection.dot(existingDirection));
      const angleFromPerpendicular = Math.abs(angle);
      
      if (angleFromPerpendicular <= Math.sin(this.angleThreshold)) {
        const confidence = this.calculateRightAngleConfidence(angleFromPerpendicular, newSegment, existing);
        constraints.push(new RightAngleConstraint(newSegment, existing, confidence));
      }
    }
    
    return constraints.sort((a, b) => b.confidence - a.confidence);
  }
  
  private calculateRightAngleConfidence(deviation: number, seg1: LineSegment, seg2: LineSegment): number {
    const maxDeviation = Math.sin(this.angleThreshold);
    let confidence = 1.0 - (deviation / maxDeviation);
    
    // Boost confidence if segments share an endpoint
    if (this.sharesEndpoint(seg1, seg2)) {
      confidence *= 1.5;
    }
    
    return Math.min(1.0, confidence);
  }
  
  private sharesEndpoint(seg1: LineSegment, seg2: LineSegment): boolean {
    const tolerance = 5.0; // pixels
    
    return seg1.startPoint.distanceTo(seg2.startPoint) < tolerance ||
           seg1.startPoint.distanceTo(seg2.endPoint) < tolerance ||
           seg1.endPoint.distanceTo(seg2.startPoint) < tolerance ||
           seg1.endPoint.distanceTo(seg2.endPoint) < tolerance;
  }
}
```

## Constraint Solving Engine

### Constraint System Architecture

```typescript
/**
 * Main constraint solving engine using iterative relaxation
 */
export class ConstraintSolver {
  private readonly maxIterations = 100;
  private readonly convergenceThreshold = 1e-6;
  private readonly relaxationFactor = 0.1;
  
  async solve(model: ConstraintModel): Promise<SolverResult> {
    const constraints = model.getActiveConstraints();
    const elements = model.getElements();
    
    let totalError = Number.MAX_VALUE;
    let iterations = 0;
    
    while (iterations < this.maxIterations && totalError > this.convergenceThreshold) {
      totalError = 0;
      
      // Solve each constraint
      for (const constraint of constraints) {
        const error = constraint.calculateError();
        if (Math.abs(error) > this.convergenceThreshold) {
          constraint.applyCorrection(this.relaxationFactor);
          totalError += Math.abs(error);
        }
      }
      
      // Update dependent constraints
      await this.updateDependentConstraints(constraints);
      
      iterations++;
    }
    
    return {
      converged: totalError <= this.convergenceThreshold,
      iterations,
      finalError: totalError,
      success: iterations < this.maxIterations
    };
  }
  
  private async updateDependentConstraints(constraints: GeometricConstraint[]): Promise<void> {
    // Update constraint dependencies based on element changes
    for (const constraint of constraints) {
      if (constraint.needsUpdate) {
        constraint.update();
      }
    }
  }
}
```

### Individual Constraint Implementations

```typescript
/**
 * Equal length constraint implementation
 */
export class EqualLengthConstraint extends GeometricConstraint {
  constructor(
    private segment1: LineSegment,
    private segment2: LineSegment,
    confidence: number
  ) {
    super([segment1, segment2], confidence);
  }
  
  calculateError(): number {
    return this.segment1.length - this.segment2.length;
  }
  
  applyCorrection(factor: number): void {
    const error = this.calculateError();
    const correction = error * factor * 0.5; // Split correction between segments
    
    // Adjust segment lengths by moving endpoints
    this.adjustSegmentLength(this.segment1, -correction);
    this.adjustSegmentLength(this.segment2, correction);
  }
  
  private adjustSegmentLength(segment: LineSegment, deltaLength: number): void {
    const direction = segment.direction.normalized;
    const lengthAdjustment = direction.multiply(deltaLength * 0.5);
    
    // Move endpoints in opposite directions to maintain midpoint
    const currentStart = segment.startPoint.worldCoordinates;
    const currentEnd = segment.endPoint.worldCoordinates;
    
    segment.startPoint.worldCoordinates = currentStart.subtract(lengthAdjustment);
    segment.endPoint.worldCoordinates = currentEnd.add(lengthAdjustment);
  }
}

/**
 * Parallel constraint implementation
 */
export class ParallelConstraint extends GeometricConstraint {
  constructor(
    private segment1: LineSegment,
    private segment2: LineSegment,
    confidence: number
  ) {
    super([segment1, segment2], confidence);
  }
  
  calculateError(): number {
    const dir1 = this.segment1.direction.normalized;
    const dir2 = this.segment2.direction.normalized;
    
    // Calculate angle between directions (0 for parallel)
    return Math.asin(Math.abs(dir1.cross(dir2)));
  }
  
  applyCorrection(factor: number): void {
    const error = this.calculateError();
    if (Math.abs(error) < 1e-10) return;
    
    const dir1 = this.segment1.direction.normalized;
    const dir2 = this.segment2.direction.normalized;
    
    // Calculate target direction (average of both)
    const targetDirection = dir1.add(dir2).normalized;
    
    // Adjust both segments toward target direction
    this.adjustSegmentDirection(this.segment1, targetDirection, factor * 0.5);
    this.adjustSegmentDirection(this.segment2, targetDirection, factor * 0.5);
  }
  
  private adjustSegmentDirection(segment: LineSegment, targetDirection: Vec2, factor: number): void {
    const currentDirection = segment.direction.normalized;
    const correctionDirection = targetDirection.subtract(currentDirection).multiply(factor);
    
    const length = segment.length;
    const midpoint = segment.startPoint.worldCoordinates.add(segment.endPoint.worldCoordinates).divide(2);
    const newDirection = currentDirection.add(correctionDirection).normalized;
    
    // Reposition endpoints around midpoint with new direction
    const halfVector = newDirection.multiply(length * 0.5);
    segment.startPoint.worldCoordinates = midpoint.subtract(halfVector);
    segment.endPoint.worldCoordinates = midpoint.add(halfVector);
  }
}
```

## Performance Optimization Strategies

### WebAssembly Acceleration

```typescript
/**
 * WebAssembly-accelerated constraint solving for performance-critical operations
 */
export class WasmConstraintSolver {
  private wasmModule?: any;
  
  async initialize(): Promise<void> {
    // Load constraint solver compiled from Rust/C++
    this.wasmModule = await import('./constraint_solver.wasm');
  }
  
  async solveConstraintsWasm(constraints: ConstraintData[]): Promise<SolverResult> {
    if (!this.wasmModule) {
      throw new Error('WASM module not initialized');
    }
    
    // Convert TypeScript constraints to flat arrays for WASM
    const constraintArray = this.serializeConstraints(constraints);
    
    // Call WASM solver (10-100x faster for large constraint systems)
    const result = this.wasmModule.solve_constraints(
      constraintArray,
      this.maxIterations,
      this.convergenceThreshold
    );
    
    return this.deserializeSolverResult(result);
  }
  
  private serializeConstraints(constraints: ConstraintData[]): Float32Array {
    // Flatten constraint data into typed array for efficient WASM transfer
    const data = new Float32Array(constraints.length * 8); // 8 floats per constraint
    
    for (let i = 0; i < constraints.length; i++) {
      const constraint = constraints[i];
      const offset = i * 8;
      
      data[offset + 0] = constraint.type;
      data[offset + 1] = constraint.element1Id;
      data[offset + 2] = constraint.element2Id;
      data[offset + 3] = constraint.targetValue;
      data[offset + 4] = constraint.weight;
      data[offset + 5] = constraint.tolerance;
      data[offset + 6] = constraint.stiffness;
      data[offset + 7] = constraint.damping;
    }
    
    return data;
  }
}
```

### Spatial Indexing for Fast Queries

```typescript
/**
 * QuadTree implementation for fast spatial queries during recognition
 */
export class SpatialIndex {
  private root: QuadTreeNode;
  private readonly maxDepth = 8;
  private readonly maxElements = 10;
  
  constructor(bounds: BoundingBox) {
    this.root = new QuadTreeNode(bounds, 0);
  }
  
  insert(element: SpatialElement): void {
    this.root.insert(element, this.maxDepth, this.maxElements);
  }
  
  queryRange(range: BoundingBox): SpatialElement[] {
    const results: SpatialElement[] = [];
    this.root.queryRange(range, results);
    return results;
  }
  
  queryRadius(center: Vec2, radius: number): SpatialElement[] {
    const bounds = new BoundingBox(
      center.subtract(new Vec2(radius, radius)),
      center.add(new Vec2(radius, radius))
    );
    
    return this.queryRange(bounds).filter(element => 
      element.position.distanceTo(center) <= radius
    );
  }
  
  // Find nearest neighbors for constraint recognition
  findNearestSegments(point: Vec2, maxDistance: number, maxCount: number): GeometricSegment[] {
    const candidates = this.queryRadius(point, maxDistance);
    
    return candidates
      .map(element => ({
        segment: element.segment,
        distance: element.segment.distanceToPoint(point)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, maxCount)
      .map(item => item.segment);
  }
}
```

## Integration Patterns

### Recognition Pipeline Coordinator

```typescript
/**
 * Coordinates the entire recognition pipeline across all stages
 */
export class RecognitionCoordinator {
  private singleStrokeRecognizer = new SingleStrokeRecognizer();
  private penUpRecognizer = new PenUpRecognizer();
  private deferredRecognizer = new DeferredRecognizer();
  private dynamicRecognizer = new DynamicRecognizer();
  
  private spatialIndex = new SpatialIndex(new BoundingBox(Vec2.ZERO, new Vec2(4096, 4096)));
  
  async processStroke(strokeData: StrokeData, model: DrawingModel): Promise<RecognitionResult> {
    // Stage 1: Real-time recognition
    const initialResult = await this.singleStrokeRecognizer.recognize(strokeData);
    
    // Update spatial index
    for (const segment of initialResult.segments) {
      this.spatialIndex.insert(new SpatialElement(segment));
    }
    
    // Stage 2: Enhanced pen-up recognition
    const refinedResult = await this.penUpRecognizer.refine(initialResult, this.spatialIndex);
    
    // Stage 3: Schedule deferred recognition (background)
    setTimeout(() => {
      this.deferredRecognizer.analyze(model, this.spatialIndex);
    }, 100);
    
    return refinedResult;
  }
  
  async processModelChange(change: ModelChange, model: DrawingModel): Promise<void> {
    // Stage 4: Dynamic recognition during manipulation
    await this.dynamicRecognizer.updateRecognition(change, model, this.spatialIndex);
  }
}
```

This algorithmic foundation provides the sophisticated recognition and constraint solving capabilities that made the original Zotebook revolutionary. The web port can leverage modern optimizations like WebAssembly, spatial indexing, and parallel processing to achieve even better performance than the original while maintaining the same level of geometric intelligence.