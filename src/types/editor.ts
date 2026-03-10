/**
 * Core type definitions for the SVG Editor application.
 * Centralizes all shared types used across hooks, components, and utilities.
 */

/** Supported SVG shape tag names */
export type SvgShapeTag =
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polygon'
  | 'polyline'
  | 'path'
  | 'text'
  | 'g'
  | 'image'
  | 'use';

/** Actions the user can perform on the canvas */
export type ActiveAction =
  | 'drag'
  | 'resize'
  | 'resize-line'
  | 'resize-poly'
  | 'marquee'
  | null;

/** Alignment directions for multi-select alignment */
export type AlignDirection =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center horizontally'
  | 'center vertically';

/** Toast notification severity levels */
export type ToastSeverity = 'info' | 'success' | 'error';

/** A toast message entry in the notification queue */
export interface ToastMessage {
  id: number;
  message: string;
  severity: ToastSeverity;
}

/** Bounding box in SVG coordinate space */
export interface SvgBBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 2D point */
export interface Point {
  x: number;
  y: number;
}

/** Shape attribute definition for the properties panel */
export interface ShapeAttributes {
  attrs: string[];
  showTextContent: boolean;
}
