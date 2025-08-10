import { Mat3 } from './mat3.js';
import { Vec2 } from './vec2.js';

/**
 * Multi-coordinate point system for touch-accurate drawing across zoom levels.
 * Based on the original Zotebook Pt implementation with key innovation:
 * Points exist simultaneously in multiple coordinate systems and maintain
 * precision during transformations.
 */

export enum CoordinateSystem {
  SCREEN = 'screen',     // Raw device pixels
  VIEWPORT = 'viewport', // Viewport-relative coordinates  
  WORLD = 'world'        // World/document coordinates
}

export interface CoordinateTransforms {
  screenToViewport: Mat3;
  viewportToWorld: Mat3;
  worldToViewport: Mat3;
  viewportToScreen: Mat3;
}

/**
 * Immutable point that maintains coordinates in multiple systems.
 * Critical for touch accuracy - touch events come in screen coordinates,
 * but drawing happens in world coordinates with pan/zoom transforms.
 */
export class Pt {
  // Primary coordinate storage - we store in world coordinates as canonical
  private readonly _worldCoordinates: Vec2;
  
  // Cached coordinates in other systems
  private _screenCoordinates?: Vec2;
  private _viewportCoordinates?: Vec2;
  
  // Transform matrices for coordinate conversion
  private readonly _transforms: CoordinateTransforms;

  constructor(coordinates: Vec2, system: CoordinateSystem, transforms: CoordinateTransforms) {
    this._transforms = transforms;
    
    // Convert input coordinates to world coordinates (our canonical storage)
    switch (system) {
      case CoordinateSystem.WORLD:
        this._worldCoordinates = coordinates;
        break;
      case CoordinateSystem.VIEWPORT:
        this._worldCoordinates = transforms.viewportToWorld.transformPoint(coordinates);
        this._viewportCoordinates = coordinates; // Cache the input
        break;
      case CoordinateSystem.SCREEN:
        const viewport = transforms.screenToViewport.transformPoint(coordinates);
        this._worldCoordinates = transforms.viewportToWorld.transformPoint(viewport);
        this._screenCoordinates = coordinates; // Cache the input
        break;
    }
  }

  // Static factory methods for cleaner creation
  static fromScreen(screenCoords: Vec2, transforms: CoordinateTransforms): Pt {
    return new Pt(screenCoords, CoordinateSystem.SCREEN, transforms);
  }

  static fromViewport(viewportCoords: Vec2, transforms: CoordinateTransforms): Pt {
    return new Pt(viewportCoords, CoordinateSystem.VIEWPORT, transforms);
  }

  static fromWorld(worldCoords: Vec2, transforms: CoordinateTransforms): Pt {
    return new Pt(worldCoords, CoordinateSystem.WORLD, transforms);
  }

  // Coordinate accessors with lazy computation
  get world(): Vec2 {
    return this._worldCoordinates;
  }

  get viewport(): Vec2 {
    if (this._viewportCoordinates === undefined) {
      this._viewportCoordinates = this._transforms.worldToViewport.transformPoint(this._worldCoordinates);
    }
    return this._viewportCoordinates;
  }

  get screen(): Vec2 {
    if (this._screenCoordinates === undefined) {
      this._screenCoordinates = this._transforms.viewportToScreen.transformPoint(this.viewport);
    }
    return this._screenCoordinates;
  }

  // Coordinate system queries
  inSystem(system: CoordinateSystem): Vec2 {
    switch (system) {
      case CoordinateSystem.WORLD:
        return this.world;
      case CoordinateSystem.VIEWPORT:
        return this.viewport;
      case CoordinateSystem.SCREEN:
        return this.screen;
    }
  }

  // Distance calculations in different coordinate systems
  distanceTo(other: Pt, system: CoordinateSystem = CoordinateSystem.WORLD): number {
    return this.inSystem(system).distanceTo(other.inSystem(system));
  }

  distanceToSquared(other: Pt, system: CoordinateSystem = CoordinateSystem.WORLD): number {
    return this.inSystem(system).distanceToSquared(other.inSystem(system));
  }

  // Vector operations that return new Pt instances
  add(vector: Vec2, system: CoordinateSystem = CoordinateSystem.WORLD): Pt {
    const coords = this.inSystem(system).add(vector);
    return new Pt(coords, system, this._transforms);
  }

  subtract(other: Pt, system: CoordinateSystem = CoordinateSystem.WORLD): Vec2 {
    return this.inSystem(system).subtract(other.inSystem(system));
  }

  // Linear interpolation between points
  lerp(other: Pt, t: number, system: CoordinateSystem = CoordinateSystem.WORLD): Pt {
    const coords = this.inSystem(system).lerp(other.inSystem(system), t);
    return new Pt(coords, system, this._transforms);
  }

  // Transform to new coordinate system (returns new Pt with updated transforms)
  withTransforms(newTransforms: CoordinateTransforms): Pt {
    return new Pt(this._worldCoordinates, CoordinateSystem.WORLD, newTransforms);
  }

  // Equality testing with coordinate system awareness
  isEqual(other: Pt, system: CoordinateSystem = CoordinateSystem.WORLD, epsilon: number = Number.EPSILON): boolean {
    return this.inSystem(system).isEqual(other.inSystem(system), epsilon);
  }

  // Touch tolerance testing - crucial for gesture recognition
  isNearTouch(other: Pt, tolerancePixels: number = 10): boolean {
    return this.distanceTo(other, CoordinateSystem.SCREEN) <= tolerancePixels;
  }

  // Snapping utilities for constraint recognition
  snapToGrid(gridSize: number, system: CoordinateSystem = CoordinateSystem.WORLD): Pt {
    const coords = this.inSystem(system);
    const snappedCoords = new Vec2(
      Math.round(coords.x / gridSize) * gridSize,
      Math.round(coords.y / gridSize) * gridSize
    );
    return new Pt(snappedCoords, system, this._transforms);
  }

  snapToPoint(other: Pt, snapDistance: number, system: CoordinateSystem = CoordinateSystem.WORLD): Pt {
    if (this.distanceTo(other, system) <= snapDistance) {
      return other;
    }
    return this;
  }

  // Conversion and serialization
  toJSON(system: CoordinateSystem = CoordinateSystem.WORLD): { x: number; y: number; system: string } {
    const coords = this.inSystem(system);
    return {
      x: coords.x,
      y: coords.y,
      system: system
    };
  }

  toString(system: CoordinateSystem = CoordinateSystem.WORLD): string {
    const coords = this.inSystem(system);
    return `Pt(${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}) [${system}]`;
  }

  // Debug information showing all coordinate systems
  debugInfo(): string {
    return `Pt {\n` +
           `  world: ${this.world.toString()}\n` +
           `  viewport: ${this.viewport.toString()}\n` +
           `  screen: ${this.screen.toString()}\n` +
           `}`;
  }
}

/**
 * Transform context for managing coordinate system conversions.
 * Typically created once per viewport/camera state and shared across points.
 */
export class TransformContext {
  private _transforms: CoordinateTransforms;

  constructor(
    viewportSize: Vec2,
    worldTransform: Mat3,
    devicePixelRatio: number = window.devicePixelRatio || 1
  ) {
    // Screen to viewport: account for device pixel ratio
    const screenToViewport = Mat3.scale(1 / devicePixelRatio);
    
    // Viewport to screen: inverse of above
    const viewportToScreen = Mat3.scale(devicePixelRatio);
    
    // World to viewport and viewport to world from camera transform
    const worldToViewport = worldTransform;
    const viewportToWorld = worldTransform.inverse;

    this._transforms = {
      screenToViewport,
      viewportToWorld,
      worldToViewport,
      viewportToScreen
    };
  }

  get transforms(): CoordinateTransforms {
    return this._transforms;
  }

  // Factory methods for creating points in this context
  createPointFromScreen(screenCoords: Vec2): Pt {
    return Pt.fromScreen(screenCoords, this._transforms);
  }

  createPointFromViewport(viewportCoords: Vec2): Pt {
    return Pt.fromViewport(viewportCoords, this._transforms);
  }

  createPointFromWorld(worldCoords: Vec2): Pt {
    return Pt.fromWorld(worldCoords, this._transforms);
  }

  // Update transforms when viewport changes (pan, zoom, resize)
  withWorldTransform(newWorldTransform: Mat3): TransformContext {
    const screenToViewport = this._transforms.screenToViewport;
    const viewportToScreen = this._transforms.viewportToScreen;
    
    return new TransformContext(
      Vec2.ZERO, // Not used in this constructor path
      newWorldTransform,
      1 / screenToViewport.scale.x // Recover device pixel ratio
    );
  }

  // Convert points created in other contexts to this context
  adoptPoint(point: Pt): Pt {
    return point.withTransforms(this._transforms);
  }
}

// Utility functions for common operations
export namespace Pt {
  // Create transform context from common UI state
  export function createTransformContext(
    canvasSize: Vec2,
    panOffset: Vec2,
    zoomLevel: number,
    devicePixelRatio?: number
  ): TransformContext {
    const worldTransform = Mat3.IDENTITY
      .translate(canvasSize.multiply(0.5)) // Center origin
      .scaleBy(zoomLevel)                  // Apply zoom
      .translate(panOffset);               // Apply pan

    return new TransformContext(canvasSize, worldTransform, devicePixelRatio);
  }

  // Distance between points in world coordinates
  export const distance = (a: Pt, b: Pt): number => a.distanceTo(b);

  // Linear interpolation between points
  export const lerp = (a: Pt, b: Pt, t: number): Pt => a.lerp(b, t);
}