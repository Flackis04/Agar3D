# Performance Optimizations

This document describes the performance improvements made to the Agar3D game.

## Summary of Optimizations

### 1. Collision Detection Optimization
- **Issue**: Checking 200,000 pellets every frame with O(n) complexity
- **Solution**: Implemented spatial culling with distance-based quick rejection
- **Impact**: Only checks pellets within player radius + buffer range
- **Method**: Uses squared distance calculations to avoid expensive sqrt operations

### 2. Geometry Complexity Reduction
- **Player Sphere**: Reduced from 24x24 (1,152 faces) to 16x16 (512 faces) - 55% reduction
- **Pellet Spheres**: Reduced from 8x8 to 6x6 for 200k instances - significant GPU memory savings
- **Box Border**: Reduced from 128³ to 64³ subdivisions (~2M to ~500K vertices) - 75% reduction

### 3. Renderer Optimizations
- Added `powerPreference: 'high-performance'` to request dedicated GPU
- Enabled frustum culling on instanced meshes for automatic off-screen culling
- Added efficient window resize handler

### 4. Code Cleanup
- Removed unused raycaster that was being set every frame
- Fixed module import inconsistencies (CDN vs npm)
- Consolidated module loading

## Expected Performance Gains

With 200,000 pellets rendered:
- **Collision Detection**: 95%+ reduction in distance calculations per frame
- **Rendering**: 50-60% reduction in geometry complexity
- **Memory**: Significant GPU memory savings from simpler geometry
- **Frame Rate**: Expected 30-50% improvement in FPS, especially on lower-end hardware

## Benchmark Methodology

Performance can be measured using:
1. Built-in Stats.js panel (bottom-right corner)
2. Browser DevTools Performance tab
3. three.js renderer info: `renderer.info.render.calls`, `renderer.info.render.triangles`
