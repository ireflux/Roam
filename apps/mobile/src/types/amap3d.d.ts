/**
 * react-native-amap3d 类型替身：
 * 该库发布物为未经编译的 TSX，直接参与类型检查会因 RN 类型版本差异报错。
 * 经 tsconfig paths 将其重定向到本文件，仅声明本项目用到的 API 子集（spec §7）。
 */
import type * as React from "react";

export interface LatLng {
    latitude: number;
    longitude: number;
  }

export interface CameraPosition {
    target: LatLng;
    zoom: number;
  }

export interface MapPoi {
    id?: string;
    name?: string;
    latitude: number;
    longitude: number;
  }

  export type MapPressEvent = { nativeEvent: LatLng };

export interface MapViewProps {
    style?: React.CSSProperties | object;
    initialCameraPosition?: CameraPosition;
    myLocationEnabled?: boolean;
    scrollGesturesEnabled?: boolean;
    zoomGesturesEnabled?: boolean;
    rotateGesturesEnabled?: boolean;
    onPress?: (event: MapPressEvent) => void;
    onPressPoi?: (event: { nativeEvent: MapPoi }) => void;
    children?: React.ReactNode;
  }

export interface MarkerProps {
    position: LatLng;
    zIndex?: number;
    onPress?: () => void;
    children?: React.ReactNode;
  }

export interface PolylineProps {
    points: LatLng[];
    width?: number;
    color?: string;
    dotted?: boolean;
    gradient?: boolean;
    zIndex?: number;
    onPress?: () => void;
  }

export const AMapSdk: {
  init(apiKey?: string): void;
  getVersion(): Promise<string>;
};

export const MapView: React.ComponentType<MapViewProps>;
export const Marker: React.ComponentType<MarkerProps>;
export const Polyline: React.ComponentType<PolylineProps>;
