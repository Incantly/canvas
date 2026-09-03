declare function require(id: string): unknown

declare module 'react-native-enriched-markdown' {
  import type { ComponentType } from 'react'

  export type EnrichedMarkdownTextInputInstance = {
    toggleBold: () => void
    toggleItalic: () => void
    toggleUnderline: () => void
    toggleStrikethrough: () => void
    toggleHeading: (level: number) => void
    toggleUnorderedList: () => void
    toggleOrderedList: () => void
    setLink: (url: string) => void
    setValue: (markdown: string) => void
  }

  export type StyleState = {
    bold?: { isActive?: boolean }
    italic?: { isActive?: boolean }
    underline?: { isActive?: boolean }
    strikethrough?: { isActive?: boolean }
    heading?: { isActive?: boolean; level?: number }
    unorderedList?: { isActive?: boolean }
    orderedList?: { isActive?: boolean }
  }

  export const EnrichedMarkdownTextInput: ComponentType<{
    defaultValue?: string
    placeholder?: string
    placeholderTextColor?: string
    scrollEnabled?: boolean
    style?: object
    onChangeMarkdown?: (md: string) => void
    onChangeState?: (state: StyleState) => void
    onFocus?: () => void
    onBlur?: () => void
  }>
}
