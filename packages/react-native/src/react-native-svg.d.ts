declare module 'react-native-svg' {
  import type { ComponentType } from 'react'

  type SvgComponent = ComponentType<Record<string, unknown>>

  const Svg: SvgComponent
  export default Svg
  export const Circle: SvgComponent
  export const Ellipse: SvgComponent
  export const G: SvgComponent
  export const Path: SvgComponent
  export const Rect: SvgComponent
}
