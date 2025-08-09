# Zotebook Web Port - Development Context

This document provides Claude Code with essential context for the Zotebook web port project.

## Project Overview

**Zotebook Web** is a TypeScript/web port of the original Zotebook gesture-based CAD application. This is a completely independent implementation that preserves the innovative interaction paradigms and mathematical foundations while leveraging modern web technologies.

### Original Application Context
- **Zotebook (2015-2017)**: Pioneering gesture-based CAD app for iPad
- **Technology**: Xamarin iOS with C# and OpenGL ES
- **Innovation**: Touch-first technical drawing with automatic constraint recognition
- **Status**: Legacy codebase, Xamarin end-of-life (May 2024), not commercially viable

### Web Port Goals
- **Platform**: Modern web browsers with TypeScript
- **Target**: Universal accessibility across all devices
- **Focus**: Educational use and demonstration of innovative UI paradigms
- **Architecture**: Clean, modern implementation independent of legacy code

## Technical Analysis Summary

### Feasibility Assessment: EXCELLENT ✅
Based on comprehensive analysis (August 2025), a web port is highly feasible:

#### Touch Input Capabilities
- **Multi-touch support**: Modern Pointer Events API provides complete gesture support
- **Gesture recognition**: 1-finger draw, 2-finger pan/zoom, 3-finger undo all supported
- **Performance**: <16ms latency with low-latency canvas rendering
- **Cross-platform**: Works on desktop, tablet, and mobile devices

#### Graphics Performance
- **WebGL 2.0**: 95% of native OpenGL ES performance
- **WebGPU**: 2-3x performance improvement where supported
- **Hardware acceleration**: Full GPU utilization for rendering
- **Shader support**: Custom GLSL shaders for optimized drawing

#### Mathematical Foundation
- **TypeScript libraries**: Math.js, ts-geometry, ml-matrix available
- **WebAssembly**: 10-100x speedup for constraint solving algorithms
- **Web Workers**: Parallel processing for complex computations
- **Memory management**: Modern GC eliminates manual memory bugs

## Core Algorithms to Port

### Mathematical Primitives (from ZB.Core)
```csharp
// Original C# classes to port to TypeScript:
- Vec2, Vec3, Vec4: Vector mathematics
- Mat3, Mat4: Matrix transformations  
- Pt: Multi-coordinate system points
- Quaternion: 3D rotations
```

### Geometric Elements (from ZB.Core.Geometry)
```csharp
// Shape primitives to implement:
- LineSegment: Straight line segments
- ArcSegment: Circular arcs
- CircleSegment: Full circles
- SplineSegment: Smooth curves
- EllipseSegment: Elliptical shapes
```

### Recognition Algorithms (from Simi.Core.Domain)
```csharp
// Gesture recognizers to port:
- LatchRecognizer: Automatic endpoint joining
- EqualLengthRecognizer: Equal length constraint detection
- ParallelRecognizer: Parallel line gesture recognition
- RightAngleRecognizer: Perpendicular line detection
- EraseRecognizer: Scribble-to-erase gestures
```

### Constraint Solving (from ZB.Solver)
```csharp
// Constraint system to implement:
- ConstraintModel: High-level constraint management
- ConstraintSolver: Numerical constraint satisfaction
- Various constraint types: equal lengths, parallel lines, right angles
```

## Architecture Design

### Recommended Project Structure
```
zotebook-web/
├── src/
│   ├── core/
│   │   ├── math/           # Vec2, Mat3, geometric primitives
│   │   ├── geometry/       # Segments, curves, constraints  
│   │   └── solver/         # Constraint satisfaction engine
│   ├── input/
│   │   ├── touch.ts        # Multi-touch gesture handling
│   │   ├── recognition.ts  # Shape recognition algorithms
│   │   └── state.ts        # Input state machine
│   ├── rendering/
│   │   ├── webgl/         # WebGL 2.0 renderer
│   │   ├── canvas/        # Canvas 2D fallback
│   │   └── shaders/       # GLSL shader programs
│   └── ui/
│       ├── components/    # UI framework components
│       └── hooks/         # Gesture and rendering hooks
├── workers/
│   ├── constraint-solver.ts  # Background constraint solving
│   └── renderer.ts          # Offscreen canvas rendering
├── wasm/
│   └── geometry/            # Performance-critical algorithms
└── public/
    ├── tutorials/         # Interactive learning content
    └── examples/          # Sample drawings and demos
```

### Technology Stack
- **Language**: TypeScript 5.x with strict typing
- **Build Tool**: Vite for fast development and optimized builds
- **Graphics**: WebGL 2.0 with WebGPU progressive enhancement
- **Math Libraries**: Custom implementations + Math.js for advanced functions
- **Testing**: Vitest for unit tests, Playwright for integration tests
- **UI Framework**: TBD (React, Vue, or Svelte - all viable options)
- **PWA**: Service workers for offline-first capability

## Key Design Principles

### 1. Touch-First Interaction
The original Zotebook was revolutionary for being designed for touch from the ground up, not adapted from mouse interfaces. Preserve this:
- Natural gesture vocabulary (draw to create, scribble to erase)
- Multi-finger operations (pan, zoom, undo)
- Immediate visual feedback
- No traditional menus or toolbars in primary workflow

### 2. Automatic Constraint Recognition
Core innovation was inferring geometric constraints from user gestures:
- Draw parallel lines → automatically constrain as parallel
- Draw equal-looking lengths → automatically constrain as equal
- Draw perpendicular lines → automatically constrain as right angles
- Smart latching of endpoints and intersections

### 3. Educational Focus
This port targets education and demonstration:
- Interactive tutorials for learning gesture vocabulary
- Progressive complexity (simple shapes → complex constraints)
- Visual feedback showing constraint relationships
- Shareable results and embedded demos

## Development Phases

### Phase 1: Mathematical Foundation (Months 1-2)
- Port Vec2, Mat3, and basic geometric primitives to TypeScript
- Implement constraint data structures
- Create basic WebGL rendering pipeline
- Set up project infrastructure and testing

### Phase 2: Input System (Months 2-3)
- Implement Pointer Events API for multi-touch
- Create gesture recognition framework
- Port shape recognition algorithms
- Build input state machine

### Phase 3: Constraint Engine (Months 3-4)
- Port constraint solving algorithms
- Implement real-time constraint satisfaction
- Add WebAssembly acceleration for performance
- Create constraint visualization system

### Phase 4: UI & Features (Months 4-5)
- Build drawing interface
- Add file save/load functionality
- Implement undo/redo system
- Create responsive UI for different screen sizes

### Phase 5: Educational Features (Months 5-6)
- Interactive tutorials
- Example gallery
- PWA offline functionality
- Performance optimization and polish

## Performance Considerations

### Critical Performance Targets
- **Touch latency**: <16ms from touch to visual response
- **Constraint solving**: <5ms for typical models (20-50 constraints)
- **Rendering**: Maintain 60fps during active drawing
- **Memory**: Efficient handling of complex geometric models

### Optimization Strategies
- **WebAssembly**: Compile constraint solver to WASM for 10x+ speedup
- **Web Workers**: Background processing for complex operations
- **Canvas optimization**: Low-latency rendering mode, efficient redraw regions
- **Memory management**: Object pooling for frequently created/destroyed objects

## Original Codebase Insights

### Sophisticated Engineering Patterns
The original Zotebook demonstrated exceptional engineering:
- Clean separation between mathematical core and platform-specific rendering
- Event-driven architecture with sophisticated state management  
- Multi-stage recognition pipeline (single-stroke → pen-up → deferred → dynamic)
- Fuzzy recognition with certainty levels (Yes/Maybe/No)
- Construction line system for complex geometric relationships

### Key Algorithms Worth Studying
- **Graham Scan**: Convex hull computation for selection
- **Corner Detection**: Curvature analysis for stroke segmentation
- **Curve Fitting**: Converting rough strokes to precise geometric elements
- **Constraint Graph Management**: Dependency tracking and constraint merging
- **Spatial Indexing**: Efficient geometric queries for large models

## Success Metrics

### Technical Objectives
- [ ] Multi-touch gestures work reliably across browsers
- [ ] Drawing feels responsive (equivalent to native apps)
- [ ] Constraint solving handles complex models in real-time
- [ ] Works offline as PWA with full functionality
- [ ] Accessible via URL without installation

### Educational Impact
- [ ] Students can learn CAD concepts through intuitive interaction
- [ ] Tutorials effectively teach constraint-based design thinking
- [ ] Easy to integrate into educational curricula
- [ ] Demonstrable improvement in technical drawing comprehension

## Repository Independence

This implementation must be completely independent:
- ✅ **No shared dependencies** with original Xamarin codebase
- ✅ **Clean TypeScript implementation** using modern web standards
- ✅ **Independent git history** with no references to original repo
- ✅ **Standalone documentation** and development workflow
- ✅ **Self-contained algorithms** ported and reimplemented, not copied

The goal is to capture the innovative spirit and core algorithms of the original while building a thoroughly modern web application that stands on its own merits.

---

## Development Notes for Claude

When working in this repository:

1. **Reference the analysis files** (ZOTEBOOK_ANALYSIS.md, WEB_PORT_ANALYSIS.md) for detailed technical context
2. **Implement algorithms independently** - port concepts, not code
3. **Use modern TypeScript patterns** - leveraging 2024+ language features
4. **Focus on web platform strengths** - don't try to exactly replicate iOS behavior
5. **Prioritize educational value** - this is for teaching and demonstration
6. **Maintain performance standards** - the original was remarkably responsive
7. **Document design decisions** - capture rationale for future developers

The original Zotebook was ahead of its time. This web port is an opportunity to bring those innovative ideas to a modern platform where they can reach a much broader audience and continue to inspire new approaches to human-computer interaction in technical applications.