declare module 'react-native-webview' {
  import type { ComponentType } from 'react'

  export interface WebView {
    injectJavaScript(script: string): void
  }

  export const WebView: ComponentType<Record<string, unknown>>
}
